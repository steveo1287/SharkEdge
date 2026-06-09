import { NextResponse } from "next/server";

import { getMlbPlayerProfile } from "@/services/players/mlb-player-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ playerId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { playerId } = await context.params;
  const profile = await getMlbPlayerProfile(decodeURIComponent(playerId));
  if (!profile) {
    return NextResponse.json({ ok: false, error: "player_profile_not_found", playerId }, { status: 404 });
  }
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), profile });
}
