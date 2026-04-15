import type { HistoricalBetOpportunity, TrendCondition } from "../types";
import { computeWindowMetrics } from "../metrics";
import { filterRowsByConditions } from "../discovery/helpers";

export function getOutOfSampleScore(rows: HistoricalBetOpportunity[], conditions: TrendCondition[]) {
  const sorted = [...rows].sort((left, right) => left.gameDate.localeCompare(right.gameDate));
  if (sorted.length < 30) {
    return 0;
  }

  const splitIndex = Math.floor(sorted.length * 0.75);
  const validationRows = filterRowsByConditions(sorted.slice(splitIndex), conditions);
  const metrics = computeWindowMetrics(validationRows);

  return ((metrics.roi ?? 0) * 4) + (metrics.avgClv ?? 0) / 10 + Math.min(metrics.sampleSize, 100) / 100;
}
