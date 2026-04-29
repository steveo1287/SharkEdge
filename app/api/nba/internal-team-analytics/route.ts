import { NextResponse } from "next/server";

import { buildNbaStatsApiTeamAnalyticsFeed } from "@/services/nba/nba-stats-api-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const teams = await buildNbaStatsApiTeamAnalyticsFeed();

  return NextResponse.json({
    ok: teams.length > 0,
    source: teams.some((team) => team.source === "nba-stats-api") ? "nba-stats-api" : "databallr-derived",
    teamCount: teams.length,
    teams
  });
}
