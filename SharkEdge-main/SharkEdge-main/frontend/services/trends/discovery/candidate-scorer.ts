import { computeWindowMetrics, getSeasonFromDate } from "../metrics";
import { filterRowsByConditions } from "./helpers";
import type { HistoricalBetOpportunity, TrendCondition } from "../types";

export function scoreTrendCandidate(rows: HistoricalBetOpportunity[], conditions: TrendCondition[]) {
  const matched = filterRowsByConditions(rows, conditions);
  const metrics = computeWindowMetrics(matched);
  const seasons = Array.from(new Set(matched.map((row) => row.season || getSeasonFromDate(row.gameDate)).filter(Boolean))).sort();
  const recentThreshold = new Date();
  recentThreshold.setUTCDate(recentThreshold.getUTCDate() - 120);
  const recentSampleSize = matched.filter((row) => new Date(row.gameDate).getTime() >= recentThreshold.getTime()).length;

  return {
    rows: matched,
    metrics,
    seasons,
    recentSampleSize,
    score:
      (metrics.roi ?? 0) * 120 +
      (metrics.avgClv ?? 0) / 4 +
      (metrics.beatCloseRate ?? 0) * 20 +
      Math.min(metrics.sampleSize, 400) / 15
  };
}
