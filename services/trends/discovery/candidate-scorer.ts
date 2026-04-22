import { computeWindowMetrics, getSeasonFromDate } from "../metrics";
import { computeEdgeEvidenceScore } from "../statistical-guardrails";
import { filterRowsByConditions } from "./helpers";
import type { HistoricalBetOpportunity, TrendCondition } from "../types";

export function scoreTrendCandidate(rows: HistoricalBetOpportunity[], conditions: TrendCondition[]) {
  const matched = filterRowsByConditions(rows, conditions);
  const metrics = computeWindowMetrics(matched);
  const seasons = Array.from(
    new Set(matched.map((row) => row.season || getSeasonFromDate(row.gameDate)).filter(Boolean))
  ).sort();
  const recentThreshold = new Date();
  recentThreshold.setUTCDate(recentThreshold.getUTCDate() - 120);
  const recentSampleSize = matched.filter(
    (row) => new Date(row.gameDate).getTime() >= recentThreshold.getTime()
  ).length;
  const evidence = computeEdgeEvidenceScore({
    wins: metrics.wins,
    losses: metrics.losses,
    roi: metrics.roi,
    avgClv: metrics.avgClv,
    beatCloseRate: metrics.beatCloseRate,
    recentSampleSize
  });

  return {
    rows: matched,
    metrics,
    seasons,
    recentSampleSize,
    score: evidence.total,
    evidence
  };
}
