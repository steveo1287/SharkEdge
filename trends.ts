import type { LedgerBetResult, LedgerBetView, PerformanceBreakdownRow } from "@/lib/types/ledger";

function getBetProfit(result: LedgerBetResult, riskAmount: number, toWin: number, payout: number | null) {
  if (result === "WIN") {
    return Number(toWin.toFixed(2));
  }

  if (result === "LOSS") {
    return Number((-riskAmount).toFixed(2));
  }

  if (result === "CASHED_OUT") {
    return Number(((payout ?? riskAmount) - riskAmount).toFixed(2));
  }

  return 0;
}

export function calculateLedgerRecord(results: LedgerBetResult[]) {
  const wins = results.filter((result) => result === "WIN").length;
  const losses = results.filter((result) => result === "LOSS").length;
  const pushes = results.filter((result) => result === "PUSH").length;

  return {
    wins,
    losses,
    pushes
  };
}

export function calculateLedgerWinRate(results: LedgerBetResult[]) {
  const { wins, losses, pushes } = calculateLedgerRecord(results);
  const graded = wins + losses + pushes;
  if (!graded) {
    return 0;
  }

  return Number(((wins / graded) * 100).toFixed(1));
}

export function calculateLedgerNetUnits<T extends Pick<LedgerBetView, "result" | "riskAmount" | "toWin" | "payout">>(
  bets: T[]
) {
  return Number(
    bets
      .reduce(
        (total, bet) => total + getBetProfit(bet.result, bet.riskAmount, bet.toWin, bet.payout),
        0
      )
      .toFixed(2)
  );
}

export function calculateLedgerRoi<T extends Pick<LedgerBetView, "result" | "riskAmount" | "toWin" | "payout">>(
  bets: T[]
) {
  const settled = bets.filter((bet) => bet.result !== "OPEN");
  const risked = settled.reduce((total, bet) => total + bet.riskAmount, 0);
  if (!risked) {
    return 0;
  }

  const profit = calculateLedgerNetUnits(settled);
  return Number(((profit / risked) * 100).toFixed(1));
}

export function calculateLedgerAverageOdds<T extends Pick<LedgerBetView, "oddsAmerican">>(bets: T[]) {
  if (!bets.length) {
    return 0;
  }

  return Math.round(bets.reduce((total, bet) => total + bet.oddsAmerican, 0) / bets.length);
}

export function calculateLedgerAverageStake<T extends Pick<LedgerBetView, "riskAmount">>(bets: T[]) {
  if (!bets.length) {
    return 0;
  }

  return Number((bets.reduce((total, bet) => total + bet.riskAmount, 0) / bets.length).toFixed(2));
}

export function calculateAverageClv<T extends Pick<LedgerBetView, "clvPercentage">>(bets: T[]) {
  const tracked = bets.filter((bet) => typeof bet.clvPercentage === "number");
  if (!tracked.length) {
    return null;
  }

  return Number(
    (
      tracked.reduce((total, bet) => total + (bet.clvPercentage ?? 0), 0) / tracked.length
    ).toFixed(2)
  );
}

export function buildBreakdownRows<T extends Pick<LedgerBetView, "result" | "riskAmount" | "toWin" | "payout" | "clvPercentage">>(
  bets: T[],
  getLabel: (bet: T) => string
): PerformanceBreakdownRow[] {
  const buckets = new Map<string, T[]>();

  for (const bet of bets) {
    const label = getLabel(bet);
    buckets.set(label, [...(buckets.get(label) ?? []), bet]);
  }

  return Array.from(buckets.entries())
    .map(([label, bucket]) => {
      const settled = bucket.filter((bet) => bet.result !== "OPEN");
      const results = settled.map((bet) => bet.result);
      const record = calculateLedgerRecord(results);
      const winRate = calculateLedgerWinRate(results);
        const units = calculateLedgerNetUnits(settled);
      const risked = settled.reduce((total, bet) => total + bet.riskAmount, 0);
      const roi = risked ? Number(((units / risked) * 100).toFixed(1)) : 0;
      const avgStake = bucket.length
        ? Number((bucket.reduce((total, bet) => total + bet.riskAmount, 0) / bucket.length).toFixed(2))
        : 0;

      return {
        label,
        bets: bucket.length,
        winRate,
        roi,
        units,
        avgStake,
        clv: calculateAverageClv(bucket)
      };
    })
    .sort((left, right) => right.units - left.units || right.bets - left.bets || left.label.localeCompare(right.label));
}

export function formatRecordString(results: LedgerBetResult[]) {
  const { wins, losses, pushes } = calculateLedgerRecord(results);
  return `${wins}-${losses}-${pushes}`;
}
