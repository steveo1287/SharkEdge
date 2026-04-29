import { NextResponse } from "next/server";

import { buildInternalMlbTeamAnalyticsFeed } from "@/services/mlb/mlb-internal-analytics-feeds";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const teams = await buildInternalMlbTeamAnalyticsFeed();

  return NextResponse.json({
    ok: teams.length > 0,
    source: "mlb-data-api-derived",
    teamCount: teams.length,
    teams
  });
}
