import { NextResponse } from "next/server";

import { buildInternalNbaSynergyContextFeed } from "@/services/nba/nba-internal-context-feeds";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const games = await buildInternalNbaSynergyContextFeed();

  return NextResponse.json({
    ok: games.length > 0,
    source: "nba-stats-api-derived-synergy-proxy",
    gameCount: games.length,
    games
  });
}
