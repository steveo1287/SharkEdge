export type PlayerTrendInput = {
  playerId?: string;
  propType: string;
  recentAvg: number;
  longAvg: number;
  recentMinutes?: number | null;
  longMinutes?: number | null;
};

export type AdaptiveWeights = {
  recentWeight: number;
  longWeight: number;
  volatility: number;
};

export type PlayerAdaptiveAdjustment = {
  adjustedMean: number;
  weights: AdaptiveWeights;
  adjustmentFactor: number;
  blendedAverage: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function computeAdaptiveWeights(trend: PlayerTrendInput): AdaptiveWeights {
  const longAvg = Math.max(0.01, trend.longAvg);
  const diff = trend.recentAvg - longAvg;
  const magnitude = clamp(Math.abs(diff) / longAvg, 0, 0.5);

  let recentWeight = 0.5 + magnitude * 0.4;

  if (typeof trend.recentMinutes === "number" && typeof trend.longMinutes === "number" && trend.longMinutes > 0) {
    const minutesShift = clamp((trend.recentMinutes - trend.longMinutes) / trend.longMinutes, -0.25, 0.25);
    recentWeight += minutesShift * 0.25;
  }

  recentWeight = clamp(recentWeight, 0.35, 0.85);
  const longWeight = 1 - recentWeight;

  return {
    recentWeight,
    longWeight,
    volatility: magnitude
  };
}

export function applyPlayerAdaptiveAdjustment(baseMean: number, trend: PlayerTrendInput): PlayerAdaptiveAdjustment {
  const safeBase = Math.max(0.01, baseMean);
  const safeRecent = Math.max(0, trend.recentAvg);
  const safeLong = Math.max(0.01, trend.longAvg);
  const weights = computeAdaptiveWeights({ ...trend, recentAvg: safeRecent, longAvg: safeLong });
  const blendedAverage = safeRecent * weights.recentWeight + safeLong * weights.longWeight;
  const adjustmentFactor = clamp(blendedAverage / safeBase, 0.75, 1.35);

  return {
    adjustedMean: safeBase * adjustmentFactor,
    weights,
    adjustmentFactor,
    blendedAverage
  };
}
