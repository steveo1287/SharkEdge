import { NextResponse } from "next/server";

import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { repairUfcCredentialProfiles } from "@/services/ufc/fighter-profile-credential-repair";
import { getUfcFighterProfileQaReport } from "@/services/ufc/fighter-profile-qa";
import { getUfcShadowAuditHealth } from "@/services/ufc/shadow-audit-health";
import { runUfcUpcomingToSimPipeline } from "@/services/ufc/upcoming-to-sim-pipeline";

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
  const startedAt = new Date().toISOString();
  const dryRun = parseBool(url.searchParams.get("dryRun"), false);
  const modelVersion = url.searchParams.get("modelVersion") ?? "ufc-fight-iq-v1";
  const horizonDays = parseIntParam(url.searchParams.get("horizonDays"), 180, 1, 365);
  const limit = parseIntParam(url.searchParams.get("limit"), 25, 1, 100);
  const simulations = parseIntParam(url.searchParams.get("simulations"), 10_000, 1_000, 100_000);
  const skipIngest = parseBool(url.searchParams.get("skipIngest"), true);

  const repair = await repairUfcCredentialProfiles({ modelVersion, horizonDays, limit, dryRun });
  const sim = await runUfcUpcomingToSimPipeline({
    dryRun,
    skipIngest,
    modelVersion,
    horizonDays,
    limit,
    simulations,
    recordShadow: true,
    allowFallbackFeatures: true,
    forceRegenerate: true,
    includeMvp: true,
    includeEspn: true,
    includeTapology: true,
    includeUfcCom: true
  });
  const actions = countActions(sim.candidates);
  const shadowAudit = dryRun ? null : await getUfcShadowAuditHealth({ modelVersion, limit: 20 });
  const profileQa = dryRun ? null : await getUfcFighterProfileQaReport({ modelVersion, horizonDays, limit: Math.max(50, limit * 2) });
  const activeV2PendingCount = shadowAudit?.health?.activeV2PendingCount ?? 0;
  const credentialReadyRerun = profileQa?.statusCounts?.CREDENTIAL_READY_RERUN ?? 0;
  const ok = Boolean(repair.ok) && Boolean(sim.ok) && (dryRun || activeV2PendingCount > 0) && credentialReadyRerun === 0;

  return NextResponse.json({
    ok,
    mode: dryRun ? "dry-run" : "repair-and-precompute",
    startedAt,
    finishedAt: new Date().toISOString(),
    params: { modelVersion, horizonDays, limit, simulations, skipIngest },
    repair: {
      ok: repair.ok,
      dryRun: repair.dryRun,
      scanned: repair.scanned,
      repaired: repair.repaired,
      skipped: repair.skipped,
      repairedRows: repair.repairedRows.slice(0, 50),
      skippedRows: repair.skippedRows.slice(0, 20)
    },
    simSummary: {
      candidateCount: sim.candidateCount,
      simulatedCount: sim.simulatedCount,
      skippedCount: sim.skippedCount,
      reusableFeatureCount: sim.reusableFeatureCount,
      fallbackFeatureCount: sim.fallbackFeatureCount,
      actionCounts: actions.actions,
      featureSourceCounts: actions.featureSources,
      errors: sim.errors
    },
    shadowAudit: shadowAudit ? {
      activeV2PendingCount: shadowAudit.health.activeV2PendingCount,
      needsAuthorizedPrecompute: shadowAudit.health.needsAuthorizedPrecompute,
      latestRecordedAt: shadowAudit.health.latestRecordedAt,
      statusSummary: shadowAudit.statusSummary
    } : null,
    profileQa: profileQa ? {
      fighterSides: profileQa.fighterSides,
      statusCounts: profileQa.statusCounts,
      gradeCounts: profileQa.gradeCounts,
      credentialMatchCount: profileQa.credentialMatchCount,
      credentialAppliedCount: profileQa.credentialAppliedCount,
      genericAvatarCount: profileQa.genericAvatarCount,
      noFeatureCount: profileQa.noFeatureCount,
      repairQueue: profileQa.repairQueue.slice(0, 20)
    } : null
  }, { status: ok ? 200 : 207 });
}

export async function POST(request: Request) {
  return GET(request);
}
