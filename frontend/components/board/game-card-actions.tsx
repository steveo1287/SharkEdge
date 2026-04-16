"use client";

import { BetActionButton } from "@/components/bets/bet-action-button";
import type { GameCardView } from "@/lib/types/domain";
import { buildBoardBetIntent } from "@/lib/utils/bet-intelligence";

type GameCardActionsProps = {
  game: GameCardView;
  market?: "spread" | "moneyline" | "total";
};

export function GameCardActions({
  game,
  market = "moneyline"
}: GameCardActionsProps) {
  const selection = game[market];

  return (
    <>
      <BetActionButton
        intent={buildBoardBetIntent(game, market, game.detailHref ?? `/game/${game.id}`)}
      >
        Add to slip
      </BetActionButton>
      <BetActionButton
        mode="log"
        intent={buildBoardBetIntent(game, market, game.detailHref ?? `/game/${game.id}`)}
      >
        Log bet
      </BetActionButton>
    </>
  );
}
