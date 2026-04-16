export type ThresholdRule = {
  minSampleSize: number;
  maxBrier: number;
  minAverageClvPercent: number;
  minHitRate: number;
  maxLogLoss: number;
};

export type ThresholdConfig = {
  overall: ThresholdRule;
  bySport: Record<string, ThresholdRule>;
};

const defaultRule: ThresholdRule = {
  minSampleSize: 30,
  maxBrier: 0.27,
  minAverageClvPercent: -1.0,
  minHitRate: 0.56,
  maxLogLoss: 0.69
};

export const TARGET_WINNER_ACCURACY = 0.7;

export const thresholdConfig: ThresholdConfig = {
  overall: defaultRule,
  bySport: {
    MLB: {
      minSampleSize: 40,
      maxBrier: 0.26,
      minAverageClvPercent: -0.8,
      minHitRate: 0.58,
      maxLogLoss: 0.67
    },
    NBA: {
      minSampleSize: 35,
      maxBrier: 0.27,
      minAverageClvPercent: -1.0,
      minHitRate: 0.57,
      maxLogLoss: 0.68
    },
    NFL: {
      minSampleSize: 30,
      maxBrier: 0.25,
      minAverageClvPercent: -0.6,
      minHitRate: 0.59,
      maxLogLoss: 0.66
    },
    NHL: {
      minSampleSize: 35,
      maxBrier: 0.28,
      minAverageClvPercent: -1.2,
      minHitRate: 0.55,
      maxLogLoss: 0.69
    }
  }
};

export function getThresholdRule(sport?: string | null): ThresholdRule {
  if (!sport) {
    return thresholdConfig.overall;
  }
  return thresholdConfig.bySport[sport] ?? thresholdConfig.overall;
}
