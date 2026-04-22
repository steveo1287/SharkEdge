import type { HistoricalBetOpportunity } from "../types";
import { computeWindowMetrics } from "../metrics";
import { computeEdgeEvidenceScore } from "../statistical-guardrails";

export function getRollingWindowDiagnostics(rows: HistoricalBetOpportunity[]) {
  if (rows.length < 25) {
    return {
      score: 0,
      windows: 0,
      positiveRate: 0,
      warning: "Not enough matched rows for rolling validation."
    };
  }

  const sorted = [...rows].sort((left, right) => left.gameDate.localeCompare(right.gameDate));
  const windowSize = Math.max(20, Math.min(40, Math.floor(sorted.length / 3)));
  const step = Math.max(8, Math.floor(windowSize / 2));

  let positive = 0;
  let windows = 0;
  const scores: number[] = [];

  for (let index = 0; index + windowSize <= sorted.length; index += step) {
    const metrics = computeWindowMetrics(sorted.slice(index, index + windowSize));
    const evidence = computeEdgeEvidenceScore({
      wins: metrics.wins,
      losses: metrics.losses,
      roi: metrics.roi,
      avgClv: metrics.avgClv,
      beatCloseRate: metrics.beatCloseRate,
      recentSampleSize: metrics.sampleSize
    });

    windows += 1;
    scores.push(evidence.total);
    if ((metrics.roi ?? 0) > 0 && (metrics.hitRate ?? 0) >= 0.5) {
      positive += 1;
    }
  }

  if (!windows) {
    return {
      score: 0,
      windows: 0,
      positiveRate: 0,
      warning: "No rolling windows could be evaluated."
    };
  }

  const positiveRate = positive / windows;
  const meanScore = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const variance = scores.reduce((sum, value) => sum + (value - meanScore) ** 2, 0) / scores.length;
  const std = Math.sqrt(Math.max(0, variance));
  const stability = Math.max(0, Math.min(1, 1 - std / 18));
  const strength = Math.max(0, Math.min(1, meanScore / 45));
  const score = Math.max(0, Math.min(1, positiveRate * 0.45 + stability * 0.35 + strength * 0.2));

  return {
    score,
    windows,
    positiveRate,
    warning: positiveRate < 0.45 ? "Rolling windows are unstable." : null
  };
}

export function getRollingWindowScore(rows: HistoricalBetOpportunity[]) {
  return getRollingWindowDiagnostics(rows).score;
}
