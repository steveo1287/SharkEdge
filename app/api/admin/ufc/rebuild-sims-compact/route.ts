import { NextResponse } from "next/server";

import { runUfcUpcomingToSimPipeline } from "@/services/ufc/upcoming-to-sim-pipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

function authorized(request: Request) {
  const url = new URL(request.url);
  const envSecret = process.env.UFC_ADMIN_RUN_TOKEN?.trim();
  if (envSecret) {
    const bearer = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
    return url.searchParams.get("token") === envSecret || request.headers.get("x-api-key") === envSecret || bearer === envSecret;
  }
  return url.searchParams.get("confirm") === "rebuild-sims-compact";
}

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const parsed = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function countBy<T extends string>(values: T[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function gradeCounts(items: unknown[], key: string) {
  const values = items.map((item) => {
    const record = asRecord(item);
    return typeof record[key] === "string" ? record[key] as string : "UNKNOWN";
  });
  return countBy(values);
}

function compactSimulation(value: unknown) {
  const record = asRecord(value);
  const marketAware = asRecord(record.marketAware);
  const audit = asRecord(record.simInputAudit);
  const promotionGate = asRecord(record.promotionGate);
  return {
    fightId: record.fightId ?? null,
    modelVersion: record.modelVersion ?? null,
    simulations: record.simulations ?? null,
    pickFighterId: record.pickFighterId ?? null,
    fighterAWinProbability: record.fighterAWinProbability ?? null,
    fighterBWinProbability: record.fighterBWinProbability ?? null,
    fairOddsAmerican: record.fairOddsAmerican ?? null,
    edgePct: record.edgePct ?? null,
    dataQualityGrade: record.dataQualityGrade ?? null,
    confidenceGrade: record.confidenceGrade ?? null,
    simInputGrade: audit.grade ?? null,
    simInputScore: audit.score ?? null,
    promotionStatus: promotionGate.status ?? null,
    promotionGrade: promotionGate.grade ?? null,
    noMarketEdge: marketAware.noMarketEdge ?? null,
    hasRealMarket: marketAware.hasRealMarket ?? null
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=rebuild-sims-compact" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = numberParam(url, "limit", 25, 1, 100);
  const offset = numberParam(url, "offset", 0, 0, 1000);
  const horizonDays = numberParam(url, "horizonDays", 180, 1, 365);
  const simulations = numberParam(url, "simulations", 5000, 100, 25000);
  const seed = numberParam(url, "seed", 1287, 1, 999999999);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  const dryRun = boolParam(url, "dryRun", false);
  const allowFallbackFeatures = boolParam(url, "allowFallbackFeatures", false);
  const forceRegenerate = boolParam(url, "forceRegenerate", true);

  try {
    const result = await runUfcUpcomingToSimPipeline({
      skipIngest: true,
      dryRun,
      limit,
      offset,
      horizonDays,
      simulations,
      seed,
      modelVersion,
      allowFallbackFeatures,
      forceRegenerate,
      recordShadow: true
    });
    const compactSims = result.simulations.map(compactSimulation);
    return NextResponse.json({
      ok: result.ok,
      mode: result.mode,
      modelVersion: result.modelVersion,
      config: { limit, offset, nextOffset: offset + limit, horizonDays, simulations, seed, dryRun, allowFallbackFeatures, forceRegenerate },
      candidateCount: result.candidateCount,
      simulatedCount: result.simulatedCount,
      skippedCount: result.skippedCount,
      fakeSkippedCount: result.fakeSkippedCount,
      reusableFeatureCount: result.reusableFeatureCount,
      fallbackFeatureCount: result.fallbackFeatureCount,
      candidateActionCounts: countBy(result.candidates.map((candidate) => candidate.action)),
      featureSourceCounts: countBy(result.candidates.map((candidate) => candidate.featureSource)),
      dataQualityGradeCounts: gradeCounts(compactSims, "dataQualityGrade"),
      confidenceGradeCounts: gradeCounts(compactSims, "confidenceGrade"),
      simInputGradeCounts: gradeCounts(compactSims, "simInputGrade"),
      compactSimulations: compactSims.slice(0, 50),
      candidateSample: result.candidates.slice(0, 25).map((candidate) => ({
        fightId: candidate.fightId,
        eventLabel: candidate.eventLabel,
        action: candidate.action,
        featureSource: candidate.featureSource,
        fighterAFeatureCount: candidate.fighterAFeatureCount,
        fighterBFeatureCount: candidate.fighterBFeatureCount
      })),
      errors: result.errors.slice(0, 50)
    }, { status: result.ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
