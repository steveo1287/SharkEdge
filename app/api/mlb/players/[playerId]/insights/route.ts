import { NextResponse } from "next/server";

import { getMlbPlayerProfileInsight } from "@/services/players/mlb-player-profile-insights";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ playerId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { playerId } = await context.params;
  const report = await getMlbPlayerProfileInsight(decodeURIComponent(playerId));
  if (!report) {
    return NextResponse.json({ ok: false, error: "player_profile_insight_not_found", playerId }, { status: 404 });
  }
  return NextResponse.json(report);
}
