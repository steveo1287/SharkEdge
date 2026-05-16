import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { buildEliteUfcFighterProfiles } from "@/services/ufc/elite-fighter-profile-builder";
import { getUfcOperationalFeed } from "@/services/ufc/operational-feed";
import { runUfcUpcomingToSimPipeline } from "@/services/ufc/upcoming-to-sim-pipeline";
import { runWikimediaFighterEnrichment } from "@/services/ufc/wikimedia-fighter-enrichment";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";
export const maxDuration = 300;

function parseBool(value: string | null, fallback = false) {
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, Math.round(numeric))) : fallback;
}

function countActions(candidates: Array<{ action: string; featureSource: string }>) {
  return candidates.reduce((acc, candidate) => {
    acc.actions[candidate.action] = (acc.actions[candidate.action] ?? 0) + 1;
    acc.featureSources[candidate.featureSource] = (acc.featureSources[candidate.featureSource] ?? 0) + 1;
    return acc;
  }, { actions: {} as Record<string, number>, featureSources: {} as Record<string, number> });
}

export async function GET(request: Request) {
  const authError = ensureInternalApiAccess(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const dryRun = parseBool(url.searchParams.get("dryRun"));
  const modelVersion = url.searchParams.get("modelVersion") ?? "ufc-fight-iq-v1";
  const horizonDays = parseIntParam(url.searchParams.get("horizonDays"), 180, 1, 365);
  const limit = parseIntParam(url.searchParams.get("limit"), 50, 1, 100);
  const simulations = parseIntParam(url.searchParams.get("simulations"), 25_000, 1_000, 100_000);
  const includeMvp = parseBool(url.searchParams.get("includeMvp"), true);
  const includeEspn = parseBool(url.searchParams.get("includeEspn"), true);
  const includeTapology = parseBool(url.searchParams.get("includeTapology"), true);
  const includeUfcCom = parseBool(url.searchParams.get("includeUfcCom"), true);
  const allowFallbackFeatures = parseBool(url.searchParams.get("allowFallbackFeatures"), true);
  const runWikimedia = parseBool(url.searchParams.get("runWikimedia"), true);
  const rebuildProfiles = parseBool(url.searchParams.get("rebuildProfiles"), true);
  const recordShadow = parseBool(url.searchParams.get("recordShadow"), true);
  const wikimediaLimit = parseIntParam(url.searchParams.get("wikimediaLimit"), 40, 1, 200);
  const wikimediaOffset = parseIntParam(url.searchParams.get("wikimediaOffset"), 0, 0, 100_000);
  const profileLimit = parseIntParam(url.searchParams.get("profileLimit"), 2500, 1, 5000);

  const startedAt = new Date().toISOString();
  const wikimedia = runWikimedia
    ? await runWikimediaFighterEnrichment({
      limit: wikimediaLimit,
      offset: wikimediaOffset,
      dryRun,
      rebuildProfiles: false,
      modelVersion,
      horizonDays
    }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  const profiles = rebuildProfiles && !dryRun
    ? await buildEliteUfcFighterProfiles({ modelVersion, limit: profileLimit, horizonDays }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  const sim = await runUfcUpcomingToSimPipeline({
    dryRun,
    skipIngest: false,
    modelVersion,
    horizonDays,
    limit,
    simulations,
    recordShadow,
    allowFallbackFeatures,
    includeMvp,
    includeEspn,
    includeTapology,
    includeUfcCom
  });

  const feed = dryRun
    ? []
    : await getUfcOperationalFeed({ modelVersion, limit, includePast: false }).catch(() => []);
  const promotionCounts = feed.reduce((acc, card) => {
    const status = card.promotionGate?.status ?? "SHADOW_ONLY";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const actionCounts = countActions(sim.candidates);
  const missingPredictionCandidates = sim.candidates
    .filter((candidate) => candidate.action !== "simulate" && candidate.action !== "skip-existing")
    .map((candidate) => ({
      fightId: candidate.fightId,
      eventName: candidate.eventName,
      fighterAName: candidate.fighterAName,
      fighterBName: candidate.fighterBName,
      action: candidate.action,
      featureSource: candidate.featureSource,
      fighterAFeatureCount: candidate.fighterAFeatureCount,
      fighterBFeatureCount: candidate.fighterBFeatureCount
    }));

  const ok = Boolean(sim.ok) && (!profiles || Boolean((profiles as any).ok)) && (!wikimedia || Boolean((wikimedia as any).ok));
  return NextResponse.json({
    ok,
    mode: dryRun ? "dry-run" : "precompute-upcoming-sims",
    startedAt,
    finishedAt: new Date().toISOString(),
    modelVersion,
    params: {
      horizonDays,
      limit,
      simulations,
      allowFallbackFeatures,
      recordShadow,
      runWikimedia,
      rebuildProfiles,
      includeMvp,
      includeEspn,
      includeTapology,
      includeUfcCom
    },
    wikimedia,
    profiles,
    simSummary: {
      candidateCount: sim.candidateCount,
      simulatedCount: sim.simulatedCount,
      skippedCount: sim.skippedCount,
      reusableFeatureCount: sim.reusableFeatureCount,
      fallbackFeatureCount: sim.fallbackFeatureCount,
      actionCounts: actionCounts.actions,
      featureSourceCounts: actionCounts.featureSources,
      errors: sim.errors,
      missingPredictionCandidates
    },
    promotionCounts,
    feedCount: feed.length,
    sim
  }, { status: ok ? 200 : 207 });
}

export async function POST(request: Request) {
  return GET(request);
}
