import { NextResponse } from "next/server";
import { ingestTeamStats } from "@/services/stats/team-stats-ingestion";
import { ingestNbaAvailability } from "@/services/stats/nba-availability-ingestion";
import { refreshTeamPowerRatings } from "@/services/stats/team-power-ratings";
import { ingestMlbAdvancedStats } from "@/services/stats/mlb-advanced-ingestion";
import { ingestMlbPregameRosters } from "@/services/stats/mlb-pregame-rosters";
import { ingestMlbStatcastQuality } from "@/services/stats/mlb-statcast-ingestion";
import { ingestMlbPitchTracking } from "@/services/stats/mlb-pitch-tracking-feed";
import { refreshUmpireAssignments, seedMlbUmpireDb } from "@/services/simulation/mlb-umpire-db";
import { captureMlbClosingLines } from "@/services/mlb/mlb-closing-line-capture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function boolParam(value: string | null, fallback: boolean) {
  if (value == null) return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function intParam(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const apiKey = request.headers.get("x-api-key")?.trim();
  const acceptedSecrets = [
    process.env.CRON_SECRET?.trim(),
    process.env.INTERNAL_API_KEY?.trim(),
    process.env.INTERNAL_API_KEY2?.trim()
  ].filter((value): value is string => Boolean(value));
  if (!acceptedSecrets.length) return false;
  return Boolean((bearer && acceptedSecrets.includes(bearer)) || (apiKey && acceptedSecrets.includes(apiKey)));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    // MLB is the active paid/runtime lane. Keep NBA opt-in so this cron does not
    // burn worker time on disabled sports before the MLB roster feed is fresh.
    const includeNba = boolParam(url.searchParams.get("includeNba"), process.env.STATS_INGEST_INCLUDE_NBA === "true");
    const includePregameRosters = boolParam(url.searchParams.get("includePregameRosters"), true);
    const includeStatcast = boolParam(url.searchParams.get("includeStatcast"), true);
    const includePitchTracking = boolParam(url.searchParams.get("includePitchTracking"), true);
    const includeUmpires = boolParam(url.searchParams.get("includeUmpires"), true);
    const includeClosingLines = boolParam(url.searchParams.get("includeClosingLines"), true);
    const lookbackDays = intParam(url.searchParams.get("lookbackDays"), 3, 1, 14);
    const advancedLookbackDays = intParam(url.searchParams.get("advancedLookbackDays"), 7, 1, 14);
    const rosterLookaheadDays = intParam(url.searchParams.get("rosterLookaheadDays"), 3, 0, 14);
    const leagues = includeNba ? ["MLB", "NBA"] as const : ["MLB"] as const;

    const mlbPregameRosters = includePregameRosters ? await ingestMlbPregameRosters({ lookaheadDays: rosterLookaheadDays }) : null;
    const results = await ingestTeamStats({ leagues: [...leagues], lookbackDays });
    const availability = includeNba ? await ingestNbaAvailability({ lookaheadDays: 3 }) : null;
    const mlbAdvanced = await ingestMlbAdvancedStats({ lookbackDays: advancedLookbackDays });
    const [mlbStatcast, mlbPitchTracking, mlbUmpire, mlbClosingLines] = await Promise.all([
      includeStatcast ? ingestMlbStatcastQuality({ lookbackDays: 2 }) : Promise.resolve(null),
      includePitchTracking ? ingestMlbPitchTracking() : Promise.resolve(null),
      includeUmpires ? seedMlbUmpireDb().then(() => refreshUmpireAssignments()) : Promise.resolve(null),
      includeClosingLines ? captureMlbClosingLines({ windowBeforeMinutes: 90, windowAfterMinutes: 180 }) : Promise.resolve(null)
    ]);
    const powerRatings = await Promise.all([
      refreshTeamPowerRatings({ leagueKey: "MLB", lookbackGames: 12 }),
      ...(includeNba ? [refreshTeamPowerRatings({ leagueKey: "NBA", lookbackGames: 12 })] : [])
    ]);

    return NextResponse.json({
      ok: true,
      mode: includeNba ? "MLB+NBA" : "MLB",
      lookbackDays,
      advancedLookbackDays,
      rosterLookaheadDays,
      results,
      availability,
      mlbPregameRosters,
      mlbAdvanced,
      mlbStatcast,
      mlbPitchTracking,
      mlbUmpire,
      mlbClosingLines,
      powerRatings
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stats cron failed";
    console.error("[cron/stats-ingest]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
