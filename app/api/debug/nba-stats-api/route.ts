import { NextResponse } from "next/server";

import { getNbaStatsApiDebugPayload } from "@/services/nba/nba-stats-api-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function GET() {
  try {
    return NextResponse.json(await getNbaStatsApiDebugPayload());
  } catch (error) {
    return NextResponse.json({
      ok: false,
      source: "nba-stats-api",
      error: error instanceof Error ? error.message : "Unknown NBA Stats API error"
    }, { status: 200 });
  }
}
