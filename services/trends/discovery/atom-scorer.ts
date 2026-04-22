import { computeWindowMetrics } from "../metrics";
import { computeEdgeEvidenceScore } from "../statistical-guardrails";
import { filterRowsByConditions } from "./helpers";
import type { HistoricalBetOpportunity, TrendCondition } from "../types";

export function scoreTrendAtom(rows: HistoricalBetOpportunity[], atom: TrendCondition) {
  const matched = filterRowsByConditions(rows, [atom]);
  const metrics = computeWindowMetrics(matched);
  const evidence = computeEdgeEvidenceScore({
    wins: metrics.wins,
    losses: metrics.losses,
    roi: metrics.roi,
    avgClv: metrics.avgClv,
    beatCloseRate: metrics.beatCloseRate,
    recentSampleSize: Math.min(metrics.sampleSize, 12)
  });

  return {
    atom,
    rows: matched,
    sampleSize: metrics.sampleSize,
    roi: metrics.roi,
    hitRate: metrics.hitRate,
    avgClv: metrics.avgClv,
    score: evidence.total
  };
}
