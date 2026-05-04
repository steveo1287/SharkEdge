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

  const control = await getNbaSimControl(gameId);
  return NextResponse.json(
    {
      ok: Boolean(control.pregameLock),
      generatedAt: control.generatedAt,
      gameId: control.gameId,
      eventLabel: control.eventLabel,
      matchup: control.matchup,
      inputQuality: control.inputQuality,
      pregameLock: control.pregameLock,
      winnerConfidence: control.winnerConfidence,
      rotationLock: control.rotationLock,
      fourFactors: control.fourFactors,
      scheduleContext: control.scheduleContext,
      error: control.pregameLock ? undefined : control.error ?? "NBA pregame lock unavailable."
    },
    { status: control.pregameLock ? 200 : 404 }
  );
}
