import type { HistoricalBetOpportunity, TrendCondition } from "../types";
import { computeWindowMetrics } from "../metrics";
import { computeEdgeEvidenceScore, computeGeneralizationGap } from "../statistical-guardrails";
import { filterRowsByConditions } from "../discovery/helpers";

export function getOutOfSampleDiagnostics(
  rows: HistoricalBetOpportunity[],
  conditions: TrendCondition[]
) {
  const sorted = [...rows].sort((left, right) => left.gameDate.localeCompare(right.gameDate));
  if (sorted.length < 30) {
    return {
      score: 0,
      trainingSampleSize: 0,
      validationSampleSize: 0,
      roiGap: null,
      hitRateGap: null,
      penalty: 100,
      warning: "Source bucket is too small for out-of-sample validation."
    };
  }

  const splitIndex = Math.floor(sorted.length * 0.75);
  const trainingRows = filterRowsByConditions(sorted.slice(0, splitIndex), conditions);
  const validationRows = filterRowsByConditions(sorted.slice(splitIndex), conditions);
  const trainingMetrics = computeWindowMetrics(trainingRows);
  const validationMetrics = computeWindowMetrics(validationRows);
  const validationEvidence = computeEdgeEvidenceScore({
    wins: validationMetrics.wins,
    losses: validationMetrics.losses,
    roi: validationMetrics.roi,
    avgClv: validationMetrics.avgClv,
    beatCloseRate: validationMetrics.beatCloseRate,
    recentSampleSize: validationMetrics.sampleSize
  });
  const gap = computeGeneralizationGap({
    trainRoi: trainingMetrics.roi,
    validationRoi: validationMetrics.roi,
    trainHitRate: trainingMetrics.hitRate,
    validationHitRate: validationMetrics.hitRate
  });
  const thinValidationPenalty = validationMetrics.sampleSize >= 16 ? 0 : validationMetrics.sampleSize >= 8 ? 20 : 40;
  const normalizedEvidence = Math.max(0, Math.min(1, validationEvidence.total / 50));
  const normalizedGapPenalty = Math.max(0, Math.min(1, (gap.penalty + thinValidationPenalty) / 100));
  const score = Math.max(0, Math.min(1, normalizedEvidence * 0.7 + (1 - normalizedGapPenalty) * 0.3));

  return {
    score,
    trainingSampleSize: trainingMetrics.sampleSize,
    validationSampleSize: validationMetrics.sampleSize,
    roiGap: gap.roiGap,
    hitRateGap: gap.hitRateGap,
    penalty: Math.min(100, gap.penalty + thinValidationPenalty),
    warning:
      validationMetrics.sampleSize < 8
        ? "Validation sample is extremely thin."
        : gap.penalty >= 35
          ? "In-sample edge weakens meaningfully out of sample."
          : null
  };
}

export function getOutOfSampleScore(rows: HistoricalBetOpportunity[], conditions: TrendCondition[]) {
  return getOutOfSampleDiagnostics(rows, conditions).score;
}
