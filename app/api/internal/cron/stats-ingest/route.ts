import { NextResponse } from "next/server";
import { ingestTeamStats } from "@/services/stats/team-stats-ingestion";
import { ingestNbaAvailability } from "@/services/stats/nba-availability-ingestion";
import { refreshTeamPowerRatings } from "@/services/stats/team-power-ratings";
import { ingestMlbAdvancedStats } from "@/services/stats/mlb-advanced-ingestion";
import { ingestMlbStatcastQuality } from "@/services/stats/mlb-statcast-ingestion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearer === cronSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const results = await ingestTeamStats({ leagues: ["MLB", "NBA"], lookbackDays: 3 });
    const [availability, mlbAdvanced, mlbStatcast] = await Promise.all([
      ingestNbaAvailability({ lookaheadDays: 3 }),
      ingestMlbAdvancedStats({ lookbackDays: 7 }),
      ingestMlbStatcastQuality({ lookbackDays: 2 })
    ]);
    const powerRatings = await Promise.all([
      refreshTeamPowerRatings({ leagueKey: "NBA", lookbackGames: 12 }),
      refreshTeamPowerRatings({ leagueKey: "MLB", lookbackGames: 12 })
    ]);

    return NextResponse.json({ ok: true, results, availability, mlbAdvanced, mlbStatcast, powerRatings });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stats cron failed";
    console.error("[cron/stats-ingest]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
