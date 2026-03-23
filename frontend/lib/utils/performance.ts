import type { BetRecord } from "@/lib/types/domain";

export function calculateROI(profit: number, totalRisked: number) {
  if (!totalRisked) {
    return 0;
  }

  return Number(((profit / totalRisked) * 100).toFixed(1));
}

export function calculateWinRate(wins: number, losses: number, pushes = 0) {
  const graded = wins + losses + pushes;
  if (!graded) {
    return 0;
  }

  return Number(((wins / graded) * 100).toFixed(1));
}

export function calculateBetProfit(bet: BetRecord) {
  if (bet.result === "WIN") {
    return Number(bet.toWin.toFixed(2));
  }

  if (bet.result === "LOSS") {
    return Number((-bet.stake).toFixed(2));
  }

  return 0;
}

export function calculateUnits(bets: BetRecord[]) {
  return Number(
    bets.reduce((total, bet) => total + calculateBetProfit(bet), 0).toFixed(2)
  );
}

export function calculateAverageOdds(bets: BetRecord[]) {
  if (!bets.length) {
    return 0;
  }

  return Math.round(
    bets.reduce((total, bet) => total + bet.oddsAmerican, 0) / bets.length
  );
}

export function calculateRecord(bets: BetRecord[]) {
  const wins = bets.filter((bet) => bet.result === "WIN").length;
  const losses = bets.filter((bet) => bet.result === "LOSS").length;
  const pushes = bets.filter((bet) => bet.result === "PUSH").length;

  return {
    wins,
    losses,
    pushes
  };
}
