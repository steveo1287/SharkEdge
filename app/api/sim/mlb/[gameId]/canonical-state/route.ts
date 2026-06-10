import { NextResponse } from "next/server";

import { buildMlbCanonicalGameState } from "@/services/simulation/mlb-canonical-game-state";
import { getMlbFranchiseGameCenter } from "@/services/simulation/mlb-franchise-game-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteParams = { params: Promise<{ gameId: string }> };

export async function GET(_req: Request, { params }: RouteParams) {
  const { gameId } = await params;
  const game = await getMlbFranchiseGameCenter(decodeURIComponent(gameId));
  if (!game) {
    return NextResponse.json({ ok: false, error: "MLB game not found" }, { status: 404 });
  }

  const state = buildMlbCanonicalGameState(game.projection);
  return NextResponse.json({
    ok: true,
    gameId: game.gameId,
    matchup: `${state.awayTeam} @ ${state.homeTeam}`,
    canonicalState: state,
    checks: {
      scoreTotalMatchesTeamRuns: Math.abs(state.totalRuns - state.awayRuns - state.homeRuns) < 0.01,
      moneylineUsesFusedRuns: state.modelVersion === "mlb-canonical-game-state-v2-player-fused",
      playerContextUsed: state.realWorldContext.usedPlayerContext,
      awayHitterCoverage: state.realWorldContext.awayHitterCount,
      homeHitterCoverage: state.realWorldContext.homeHitterCount,
      blendWeight: state.realWorldContext.blendWeight
    }
  });
}
