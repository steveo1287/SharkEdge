import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { buildCanonicalUfcFighterProfiles } from "@/services/ufc/canonical-fighter-profile";
import { aggregateUfcHistoryStatsIntoProfiles } from "@/services/ufc/fighter-history-stat-aggregates";
import { fillUfcFighterProfileGaps } from "@/services/ufc/fighter-profile-gap-fill";
import { repairUfcCredentialProfiles } from "@/services/ufc/fighter-profile-credential-repair";
import { getUfcFighterProfileQaReport } from "@/services/ufc/fighter-profile-qa";
import { syncCompleteUfcProfilesToSimFeatures } from "@/services/ufc/complete-profile-feature-sync";
import { backfillKnownUfcFighterStats } from "@/services/ufc/ufcstats-known-fighter-backfill";

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

function compact<T>(value: T) {
  return value;
}

export async function GET(request: Request) {
  const authError = ensureInternalApiAccess(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const startedAt = new Date().toISOString();
  const dryRun = parseBool(url.searchParams.get("dryRun"), true);
  const limit = parseIntParam(url.searchParams.get("limit"), 500, 1, 5000);
  const horizonDays = parseIntParam(url.searchParams.get("horizonDays"), 180, 1, 365);
  const offset = parseIntParam(url.searchParams.get("offset"), 0, 0, 100000);
  const modelVersion = url.searchParams.get("modelVersion") ?? "ufc-fight-iq-v1";
  const upcomingOnly = parseBool(url.searchParams.get("upcomingOnly"), false);
  const runUfcStats = parseBool(url.searchParams.get("runUfcStats"), true);
  const runHistory = parseBool(url.searchParams.get("runHistory"), true);
  const runGapFill = parseBool(url.searchParams.get("runGapFill"), true);
  const runFeatureSync = parseBool(url.searchParams.get("runFeatureSync"), true);
  const runCredentialRepair = parseBool(url.searchParams.get("runCredentialRepair"), true);
  const runCanonical = parseBool(url.searchParams.get("runCanonical"), true);

  const ufcStats = runUfcStats
    ? await backfillKnownUfcFighterStats({ limit: Math.min(100, limit), offset, horizonDays, dryRun }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  const history = runHistory
    ? await aggregateUfcHistoryStatsIntoProfiles({ limit, minRows: 1, dryRun }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  const gapFill = runGapFill
    ? await fillUfcFighterProfileGaps({ limit, horizonDays, upcomingOnly, dryRun, writeFightFeatures: true }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  const featureSync = runFeatureSync
    ? await syncCompleteUfcProfilesToSimFeatures({ modelVersion, horizonDays, limit: Math.min(500, limit), dryRun }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  const credentialRepair = runCredentialRepair
    ? await repairUfcCredentialProfiles({ modelVersion, horizonDays, limit: Math.min(500, limit), dryRun }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  const canonical = runCanonical
    ? await buildCanonicalUfcFighterProfiles({ modelVersion, limit, dryRun, onlyNeedingRepair: false }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }))
    : null;

  const qa = await getUfcFighterProfileQaReport({ modelVersion, horizonDays, limit: Math.min(500, limit) }).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));

  const stages = { ufcStats, history, gapFill, featureSync, credentialRepair, canonical };
  const stageOk = Object.values(stages).every((stage) => !stage || Boolean((stage as { ok?: boolean }).ok));
  const qaStatusCounts = (qa as { statusCounts?: Record<string, number> }).statusCounts ?? {};
  const genericAvatarCount = (qa as { genericAvatarCount?: number }).genericAvatarCount ?? null;
  const repairNow = (qaStatusCounts.REPAIR_NOW ?? 0) + (qaStatusCounts.NO_FEATURE ?? 0);

  return NextResponse.json({
    ok: stageOk,
    mode: dryRun ? "dry-run" : "fill-fighter-profiles",
    startedAt,
    finishedAt: new Date().toISOString(),
    params: { modelVersion, limit, horizonDays, offset, upcomingOnly, runUfcStats, runHistory, runGapFill, runFeatureSync, runCredentialRepair, runCanonical },
    stages: compact(stages),
    qa: {
      ok: (qa as { ok?: boolean }).ok,
      fighterSides: (qa as { fighterSides?: number }).fighterSides,
      statusCounts: qaStatusCounts,
      gradeCounts: (qa as { gradeCounts?: Record<string, number> }).gradeCounts,
      credentialMatchCount: (qa as { credentialMatchCount?: number }).credentialMatchCount,
      credentialAppliedCount: (qa as { credentialAppliedCount?: number }).credentialAppliedCount,
      genericAvatarCount,
      noFeatureCount: (qa as { noFeatureCount?: number }).noFeatureCount,
      repairNow,
      repairQueue: (qa as { repairQueue?: unknown[] }).repairQueue?.slice?.(0, 25) ?? []
    }
  }, { status: stageOk ? 200 : 207 });
}

export async function POST(request: Request) {
  return GET(request);
}
