import { NextResponse } from "next/server";

import { getUfcProfileCoverageReport } from "@/services/ufc/profile-coverage-report";

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
  return url.searchParams.get("confirm") === "profile-coverage";
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

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=profile-coverage" }, { status: 401 });
  }

  const url = new URL(request.url);
  const horizonDays = numberParam(url, "horizonDays", 180, 1, 365);
  const limit = numberParam(url, "limit", 200, 1, 500);
  const compact = boolParam(url, "compact", true);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;

  try {
    const report = await getUfcProfileCoverageReport({ modelVersion, horizonDays, limit });
    if (!compact) return NextResponse.json(report, { status: report.ok ? 200 : 500 });
    return NextResponse.json({
      ok: report.ok,
      modelVersion: report.modelVersion,
      horizonDays: report.horizonDays,
      fightCount: report.fightCount,
      fighterSides: report.fighterSides,
      gradeCounts: report.gradeCounts,
      laneCounts: report.laneCounts,
      laneGradeCounts: report.laneGradeCounts,
      sourceCounts: report.sourceCounts,
      ufcStatsPayloadCounts: report.ufcStatsPayloadCounts,
      coldStartCounts: report.coldStartCounts,
      remainingDCount: report.remainingDCount,
      blockedFightCount: report.blockedFightCount,
      blockedFights: report.blockedFights.slice(0, 25),
      worstFighters: report.worstFighters.slice(0, 60).map((item) => ({
        fighterName: item.fighterName,
        opponentName: item.opponentName,
        eventLabel: item.eventLabel,
        enrichmentLane: item.enrichmentLane,
        laneConfidence: item.laneConfidence,
        laneReason: item.laneReason,
        grade: item.grade,
        score: item.score,
        hasUfcStatsPayload: item.hasUfcStatsPayload,
        featureSource: item.featureSource,
        coldStartActive: item.coldStartActive,
        missingCritical: item.missingCritical,
        missingUseful: item.missingUseful,
        recommendedNextSource: item.recommendedNextSource
      }))
    }, { status: report.ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
