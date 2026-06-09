import { NextResponse } from "next/server";

import { getMlbGamePlayerEdges } from "@/services/players/mlb-game-player-edges";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ gameId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { gameId } = await context.params;
  const url = new URL(request.url);
  const data = await getMlbGamePlayerEdges({
    gameId: decodeURIComponent(gameId),
    away: url.searchParams.get("away"),
    home: url.searchParams.get("home")
  });
  return NextResponse.json(data);
}
