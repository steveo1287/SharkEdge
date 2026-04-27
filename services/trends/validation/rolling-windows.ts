import type { HistoricalBetOpportunity } from "../types";
import { computeWindowMetrics } from "../metrics";

export function getRollingWindowScore(rows: HistoricalBetOpportunity[]) {
  if (rows.length < 25) {
    return 0;
  }

  const sorted = [...rows].sort((left, right) => left.gameDate.localeCompare(right.gameDate));
  let positive = 0;
  let windows = 0;

  for (let index = 0; index + 24 < sorted.length; index += 10) {
    const metrics = computeWindowMetrics(sorted.slice(index, index + 25));
    windows += 1;
    if ((metrics.roi ?? 0) > 0) {
      positive += 1;
    }
  }

  return windows ? positive / windows : 0;
}
