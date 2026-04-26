import { computeWindowMetrics } from "../metrics";
import { filterRowsByConditions } from "./helpers";
import type { HistoricalBetOpportunity, TrendCondition } from "../types";

export function scoreTrendAtom(rows: HistoricalBetOpportunity[], atom: TrendCondition) {
  const matched = filterRowsByConditions(rows, [atom]);
  const metrics = computeWindowMetrics(matched);

  return {
    atom,
    rows: matched,
    sampleSize: metrics.sampleSize,
    roi: metrics.roi,
    hitRate: metrics.hitRate,
    avgClv: metrics.avgClv,
    score:
      (metrics.roi ?? 0) * 100 +
      (metrics.avgClv ?? 0) / 5 +
      Math.min(metrics.sampleSize, 250) / 20
  };
}
