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
  return url.searchParams.get("confirm") === "rebuild-sims-paged";
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

function compactSimulation(value: unknown) {
  const record = asRecord(value);
  const marketAware = asRecord(record.marketAware);
  const audit = asRecord(record.simInputAudit);
  const promotionGate = asRecord(record.promotionGate);
  return {
    fightId: record.fightId ?? null,
    fighterAWinProbability: record.fighterAWinProbability ?? null,
    fighterBWinProbability: record.fighterBWinProbability ?? null,
    fairOddsAmerican: record.fairOddsAmerican ?? null,
    dataQualityGrade: record.dataQualityGrade ?? null,
    confidenceGrade: record.confidenceGrade ?? null,
    simInputGrade: audit.grade ?? null,
    simInputScore: audit.score ?? null,
    promotionStatus: promotionGate.status ?? null,
    noMarketEdge: marketAware.noMarketEdge ?? null,
    hasRealMarket: marketAware.hasRealMarket ?? null
  };
}

function count(values: Array<string | null | undefined>) {
  return values.reduce<Record<string, number>>((acc, value) => {
    const key = value || "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=rebuild-sims-paged" }, { status: 401 });
  }

  const url = new URL(request.url);
  const startOffset = numberParam(url, "offset", 0, 0, 5000);
  const pageLimit = numberParam(url, "pageLimit", 10, 1, 20);
  const maxPages = numberParam(url, "maxPages", 3, 1, 20);
  const horizonDays = numberParam(url, "horizonDays", 180, 1, 365);
  const simulations = numberParam(url, "simulations", 3000, 100, 25000);
  const seed = numberParam(url, "seed", 1287, 1, 999999999);
  const timeBudgetMs = numberParam(url, "timeBudgetMs", 135000, 10000, 165000);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  const dryRun = boolParam(url, "dryRun", false);
  const allowFallbackFeatures = boolParam(url, "allowFallbackFeatures", false);
  const forceRegenerate = boolParam(url, "forceRegenerate", true);
  const startedAtMs = Date.now();

  let offset = startOffset;
  let ok = true;
  let stopReason = "max_pages";
  let simulatedCount = 0;
  let candidateCount = 0;
  let skippedCount = 0;
  let fakeSkippedCount = 0;
  let reusableFeatureCount = 0;
  let fallbackFeatureCount = 0;
  const compactSimulations: ReturnType<typeof compactSimulation>[] = [];
  const candidateSamples: Array<{ offset: number; fightId: string; eventLabel: string; action: string; featureSource: string }> = [];
  const errors: string[] = [];
  const pages: Array<{ offset: number; nextOffset: number; ok: boolean; candidateCount: number; simulatedCount: number; skippedCount: number; errors: number }> = [];

  for (let page = 0; page < maxPages; page += 1) {
    if (Date.now() - startedAtMs > timeBudgetMs) {
      stopReason = "time_budget";
      break;
    }

    const result = await runUfcUpcomingToSimPipeline({
      skipIngest: true,
      dryRun,
      limit: pageLimit,
      offset,
      horizonDays,
      simulations,
      seed,
      modelVersion,
      allowFallbackFeatures,
      forceRegenerate,
      recordShadow: true
    });

    ok = ok && result.ok;
    candidateCount += result.candidateCount;
    simulatedCount += result.simulatedCount;
    skippedCount += result.skippedCount;
    fakeSkippedCount += result.fakeSkippedCount;
    reusableFeatureCount += result.reusableFeatureCount;
    fallbackFeatureCount += result.fallbackFeatureCount;
    errors.push(...result.errors);
    compactSimulations.push(...result.simulations.map(compactSimulation));
    candidateSamples.push(...result.candidates.slice(0, 8).map((candidate) => ({
      offset,
      fightId: candidate.fightId,
      eventLabel: candidate.eventLabel,
      action: candidate.action,
      featureSource: candidate.featureSource
    })));
    pages.push({ offset, nextOffset: offset + pageLimit, ok: result.ok, candidateCount: result.candidateCount, simulatedCount: result.simulatedCount, skippedCount: result.skippedCount, errors: result.errors.length });

    offset += pageLimit;
    if (result.candidateCount === 0 || result.simulatedCount === 0 && result.skippedCount === 0) {
      stopReason = "no_candidates";
      break;
    }
  }

  const elapsedMs = Date.now() - startedAtMs;
  return NextResponse.json({
    ok,
    mode: dryRun ? "dry-run" : "paged-rebuild",
    config: { startOffset, nextOffset: offset, pageLimit, maxPages, horizonDays, simulations, seed, timeBudgetMs, dryRun, allowFallbackFeatures, forceRegenerate },
    stopReason,
    elapsedMs,
    pages,
    totals: { candidateCount, simulatedCount, skippedCount, fakeSkippedCount, reusableFeatureCount, fallbackFeatureCount, errors: errors.length },
    gradeCounts: {
      dataQuality: count(compactSimulations.map((item) => typeof item.dataQualityGrade === "string" ? item.dataQualityGrade : undefined)),
      confidence: count(compactSimulations.map((item) => typeof item.confidenceGrade === "string" ? item.confidenceGrade : undefined)),
      simInput: count(compactSimulations.map((item) => typeof item.simInputGrade === "string" ? item.simInputGrade : undefined))
    },
    marketCounts: {
      hasRealMarket: compactSimulations.filter((item) => item.hasRealMarket === true).length,
      noMarketEdge: compactSimulations.filter((item) => item.noMarketEdge === true).length
    },
    compactSimulations: compactSimulations.slice(0, 25),
    candidateSamples: candidateSamples.slice(0, 25),
    errors: errors.slice(0, 50)
  }, { status: ok ? 200 : 207 });
}
