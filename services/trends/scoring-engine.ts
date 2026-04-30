import type { TrendEngineResult } from "@/lib/trends/engine";
import type { TrendFilters } from "@/lib/types/domain";

import { getTrendFeatureSummary } from "./feature-warehouse";
import { getTrendPerformanceMetrics } from "./performance-metrics";

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

type FeatureSummary = Awaited<ReturnType<typeof getTrendFeatureSummary>>;
type PerformanceSummary = Awaited<ReturnType<typeof getTrendPerformanceMetrics>>;

export type TrendScoreResult = {
  total: number;
  breakdown: Record<string, number>;
  context: FeatureSummary;
  performance?: PerformanceSummary | null;
};

function normalizedFilters(filters?: Partial<TrendFilters> | null): TrendFilters {
  return {
    sport: "ALL",
    league: "ALL",
    market: "ALL",
    sportsbook: "all",
    side: "ALL",
    subject: "",
    team: "",
    player: "",
    fighter: "",
    opponent: "",
    window: "90d",
    sample: 10,
    ...(filters ?? {})
  };
}

function getMarketAlignmentWeight(result: TrendEngineResult, context: FeatureSummary) {
  if (result.id === "ats") {
    const coverWeight = typeof context.atsCoverRate === "number" ? clamp(Math.max(context.atsCoverRate - 52, 0) * 4.5, 0, 120) : 0;
    const favoriteDogWeight = typeof context.underdogCoverRate === "number" || typeof context.favoriteCoverRate === "number"
      ? clamp(Math.max((context.underdogCoverRate ?? 50) - 50, (context.favoriteCoverRate ?? 50) - 50) * 2.4, 0, 60)
      : 0;
    const clvWeight = typeof context.spreadClv === "number" ? clamp(Math.max(context.spreadClv, 0) * 8, 0, 65) : 0;
    return coverWeight + favoriteDogWeight + clvWeight;
  }

  if (result.id === "ou") {
    const totalWeight = typeof context.totalHitRate === "number" ? clamp(Math.max(context.totalHitRate - 52, 0) * 4.5, 0, 120) : 0;
    const clvWeight = typeof context.totalClv === "number" ? clamp(Math.max(context.totalClv, 0) * 8, 0, 65) : 0;
    return totalWeight + clvWeight;
  }

  if (result.id === "favorite-roi") {
    const favoriteWeight = typeof context.favoriteHitRate === "number" ? clamp(Math.max(context.favoriteHitRate - 52, 0) * 4.2, 0, 110) : 0;
    const clvWeight = typeof context.moneylineClv === "number" ? clamp(Math.max(context.moneylineClv, 0) * 8, 0, 65) : 0;
    return favoriteWeight + clvWeight;
  }

  if (result.id === "underdog-roi") {
    const dogWeight = typeof context.underdogHitRate === "number" ? clamp(Math.max(context.underdogHitRate - 50, 0) * 4.2, 0, 110) : 0;
    const upsetWeight = typeof context.upsetRate === "number" ? clamp(Math.max(context.upsetRate - 50, 0) * 2.8, 0, 70) : 0;
    const clvWeight = typeof context.moneylineClv === "number" ? clamp(Math.max(context.moneylineClv, 0) * 8, 0, 65) : 0;
    return dogWeight + upsetWeight + clvWeight;
  }

  return 0;
}

function getPerformanceWeight(performance: PerformanceSummary) {
  if (!performance.gradedCount || typeof performance.performanceScore !== "number") return 0;
  const sampleMultiplier = clamp(performance.gradedCount / 120, 0.18, 1);
  return clamp(performance.performanceScore * sampleMultiplier, -110, 165);
}

function getCalibrationWeight(performance: PerformanceSummary) {
  if (typeof performance.calibrationEdge !== "number") return 0;
  return clamp(performance.calibrationEdge * 180, -45, 45);
}

export async function scoreTrendResult(
  result: TrendEngineResult,
  filters?: Partial<TrendFilters> | null
): Promise<TrendScoreResult> {
  const fullFilters = normalizedFilters(filters);
  const [context, performance] = await Promise.all([
    getTrendFeatureSummary(result, fullFilters),
    getTrendPerformanceMetrics(fullFilters)
  ]);
  const confidenceWeight = result.confidence === "strong" ? 360 : result.confidence === "moderate" ? 250 : result.confidence === "weak" ? 135 : 0;
  const sampleWeight = clamp(result.sampleSize * 1.2, 0, 320);
  const winRateWeight = typeof result.hitRate === "number" ? clamp(Math.max(result.hitRate - 52, 0) * 5, 0, 220) : 0;
  const roiWeight = typeof result.roi === "number" ? clamp(Math.max(result.roi, 0) * 6, 0, 220) : 0;
  const profitWeight = typeof result.profitUnits === "number" ? clamp(Math.max(result.profitUnits, 0) * 8, 0, 240) : 0;
  const streakWeight = result.streak?.startsWith("W") ? clamp((Number(result.streak.slice(1)) || 0) * 16, 0, 140) : 0;
  const boardWeight = clamp(result.todayMatches.length * 20, 0, 80);
  const recentFormWeight = typeof context.recentWinRate === "number" ? clamp(Math.max(context.recentWinRate - 52, 0) * 2.8, 0, 95) : 0;
  const opponentAdjustedWeight = typeof context.opponentAdjustedMargin === "number" ? clamp(Math.max(context.opponentAdjustedMargin, 0) * 10, 0, 90) : 0;
  const movementWeight = typeof context.averageClosingMove === "number" ? clamp(context.averageClosingMove * 14, 0, 55) : 0;
  const clvWeight = typeof context.averageClv === "number" ? clamp(Math.max(context.averageClv, 0) * 7, 0, 85) : 0;
  const positiveClvWeight = typeof context.positiveClvRate === "number" ? clamp(Math.max(context.positiveClvRate - 52, 0) * 2.4, 0, 95) : 0;
  const restWeight = typeof context.averageRestDays === "number" ? clamp(context.averageRestDays * 6, 0, 36) : 0;
  const restAdvantageWeight = typeof context.restAdvantageDays === "number" ? clamp(Math.max(context.restAdvantageDays, 0) * 12, 0, 54) : 0;
  const revengeWeight = typeof context.revengeRate === "number" ? clamp(Math.max(context.revengeRate - 12, 0) * 1.4, 0, 38) : 0;
  const scheduleDensityWeight = typeof context.scheduleContextScore === "number" ? clamp(Math.max(72 - context.scheduleContextScore, 0) * 0.95, 0, 60) : 0;
  const travelReliefWeight = typeof context.travelStressScore === "number" ? clamp(Math.max(70 - context.travelStressScore, 0) * 0.8, 0, 44) : 0;
  const siteStabilityWeight = typeof context.siteStabilityScore === "number" ? clamp(context.siteStabilityScore * 4.2, 0, 28) : 0;
  const backToBackPenalty = typeof context.backToBackRate === "number" ? clamp(Math.max(context.backToBackRate - 28, 0) * 1.3, 0, 42) : 0;
  const consistencyWeight = typeof context.consistencyScore === "number" ? clamp(Math.max(context.consistencyScore - 55, 0) * 1.3, 0, 75) : 0;
  const marketBreadthWeight = typeof context.marketBreadth === "number" ? clamp(Math.max(context.marketBreadth - 1, 0) * 10, 0, 55) : 0;
  const holdQualityWeight = typeof context.holdQuality === "number" ? clamp(context.holdQuality * 0.6, 0, 60) : 0;
  const marketTightnessWeight = typeof context.marketTightnessScore === "number" ? clamp(Math.max(context.marketTightnessScore - 50, 0) * 1.1, 0, 70) : 0;
  const bookDisagreementWeight = typeof context.bookDisagreementScore === "number" ? clamp(context.bookDisagreementScore * 0.4, 0, 35) : 0;
  const recencyWeight = typeof context.recencyScore === "number" ? clamp(Math.max(context.recencyScore - 55, 0) * 1.4, 0, 70) : 0;
  const volatilityWeight = typeof context.openingToCloseVolatility === "number" ? clamp(context.openingToCloseVolatility * 9, 0, 42) : 0;
  const marketAlignmentWeight = getMarketAlignmentWeight(result, context);
  const performanceWeight = getPerformanceWeight(performance);
  const calibrationWeight = getCalibrationWeight(performance);
  const depthWeight = clamp(context.sampleDepth * 1.5, 0, 70) + clamp(context.marketDepth * 0.08, 0, 65);

  const thinSamplePenalty = result.sampleSize < 16 ? 120 : result.sampleSize < 24 ? 55 : 0;
  const weakReturnPenalty = (typeof result.roi === "number" && result.roi < 2 ? 45 : 0) + (typeof result.hitRate === "number" && result.hitRate < 54 ? 35 : 0);
  const staleBoardPenalty = result.todayMatches.length === 0 ? 12 : 0;
  const warningPenalty = result.warning ? 50 : 0;

  const total = confidenceWeight + sampleWeight + winRateWeight + roiWeight + profitWeight + streakWeight + boardWeight + recentFormWeight + opponentAdjustedWeight + movementWeight + clvWeight + positiveClvWeight + restWeight + restAdvantageWeight + revengeWeight + scheduleDensityWeight + travelReliefWeight + siteStabilityWeight + consistencyWeight + marketBreadthWeight + holdQualityWeight + marketTightnessWeight + bookDisagreementWeight + recencyWeight + volatilityWeight + marketAlignmentWeight + performanceWeight + calibrationWeight + depthWeight - thinSamplePenalty - weakReturnPenalty - backToBackPenalty - staleBoardPenalty - warningPenalty;

  return {
    total,
    breakdown: {
      confidenceWeight,
      sampleWeight,
      winRateWeight,
      roiWeight,
      profitWeight,
      streakWeight,
      boardWeight,
      recentFormWeight,
      opponentAdjustedWeight,
      movementWeight,
      clvWeight,
      positiveClvWeight,
      restWeight,
      restAdvantageWeight,
      revengeWeight,
      scheduleDensityWeight,
      travelReliefWeight,
      siteStabilityWeight,
      backToBackPenalty,
      consistencyWeight,
      marketBreadthWeight,
      holdQualityWeight,
      marketTightnessWeight,
      bookDisagreementWeight,
      recencyWeight,
      volatilityWeight,
      marketAlignmentWeight,
      performanceWeight,
      calibrationWeight,
      depthWeight,
      thinSamplePenalty,
      weakReturnPenalty,
      staleBoardPenalty,
      warningPenalty
    },
    context,
    performance
  };
}
