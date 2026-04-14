import type { CandidateTrendSystem, HistoricalBetOpportunity } from "../types";

export function passesPriceGuard(system: CandidateTrendSystem, row: HistoricalBetOpportunity) {
  if (typeof row.oddsAmerican !== "number") {
    return false;
  }

  if (system.marketType === "total" || system.marketType === "spread") {
    return true;
  }

  const fair = row.closeOddsAmerican ?? row.oddsAmerican;
  return Math.abs(row.oddsAmerican - fair) <= 40;
}
