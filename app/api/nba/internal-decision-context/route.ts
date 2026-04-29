import { NextResponse } from "next/server";

import { buildInternalNbaDecisionContextFeed } from "@/services/nba/nba-internal-context-feeds";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const games = await buildInternalNbaDecisionContextFeed();

  return NextResponse.json({
    ok: games.length > 0,
    source: "espn-schedule-plus-nba-stats-or-databallr",
    gameCount: games.length,
    games
  });
}
