"use client";

import { BetActionButton } from "@/components/bets/bet-action-button";
import type { GameCardView } from "@/lib/types/domain";
import { buildBoardBetIntent } from "@/lib/utils/bet-intelligence";
import { resolveMatchupHref } from "@/lib/utils/entity-routing";

type GameCardActionsProps = {
  game: GameCardView;
  market?: "spread" | "moneyline" | "total";
};

export function GameCardActions({
  game,
  market = "moneyline"
}: GameCardActionsProps) {
  const matchupHref =
    resolveMatchupHref({
      leagueKey: game.leagueKey,
      externalEventId: game.externalEventId,
      fallbackHref: game.detailHref ?? null
    }) ?? "/board";

  return (
    <>
      <BetActionButton
        intent={buildBoardBetIntent(game, market, matchupHref)}
      >
        Add to slip
      </BetActionButton>
      <BetActionButton
        mode="log"
        intent={buildBoardBetIntent(game, market, matchupHref)}
      >
        Log bet
      </BetActionButton>
    </>
  );
}
