import { NextResponse } from "next/server";

import { getNbaSimControl } from "@/services/simulation/nba-sim-control";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const gameId = url.searchParams.get("gameId") ?? "";
  if (!gameId) {
    return NextResponse.json({ ok: false, error: "gameId is required" }, { status: 400 });
  }

  const result = await getNbaSimControl(gameId);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
