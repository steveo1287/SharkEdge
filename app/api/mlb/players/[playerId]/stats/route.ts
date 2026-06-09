import { NextResponse } from "next/server";

import { getMlbPlayerProfileWithStats } from "@/services/players/mlb-player-profile-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ playerId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { playerId } = await context.params;
  const data = await getMlbPlayerProfileWithStats(decodeURIComponent(playerId));
  if (!data) return NextResponse.json({ ok: false, error: "player_not_found" }, { status: 404 });
  return NextResponse.json(data);
}
