import { NextResponse } from "next/server";

import { buildInternalFangraphsCompatibleFeed } from "@/services/mlb/mlb-internal-analytics-feeds";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  const players = await buildInternalFangraphsCompatibleFeed();

  return NextResponse.json({
    ok: players.length > 0,
    source: "mlb-data-api-derived-fangraphs-compatible",
    playerCount: players.length,
    players
  });
}
