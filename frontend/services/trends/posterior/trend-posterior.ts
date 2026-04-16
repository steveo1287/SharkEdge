import { fairOddsAmericanFromProbability } from "@/lib/math/core";

type TrendPosteriorInput = {
  hitRate: number | null;
  marketProbability: number | null;
  sampleSize: number;
  recentSampleSize?: number | null;
  avgClv?: number | null;
  beatCloseRate?: number | null;
  validationScore?: number | null;
  overlapPenalty?: number | null;
};

export type TrendPosteriorView = {
  baselineProbability: number | null;
  rawLiftPct: number;
  shrunkLiftPct: number;
  posteriorProbability: number | null;
  fairOddsAmerican: number | null;
  uncertaintyScore: number;
  reliabilityScore: number;
  supportScore: number;
  sampleWeight: number;
  summary: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function normalizeProbability(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  if (value > 1 && value <= 100) {
    return clamp(value / 100, 0.001, 0.999);
  }

  return clamp(value, 0.001, 0.999);
}

export function buildTrendPosterior(input: TrendPosteriorInput): TrendPosteriorView {
  const baselineProbability = normalizeProbability(input.marketProbability);
  const hitRate = normalizeProbability(input.hitRate);

  if (baselineProbability === null || hitRate === null) {
    return {
      baselineProbability,
      rawLiftPct: 0,
      shrunkLiftPct: 0,
      posteriorProbability: hitRate,
      fairOddsAmerican: fairOddsAmericanFromProbability(hitRate),
      uncertaintyScore: 92,
      reliabilityScore: 8,
      supportScore: 0,
      sampleWeight: 0,
      summary:
        "Trend posterior stayed neutral because either the trend hit rate or the market baseline was unavailable."
    };
  }

  const sampleSize = Math.max(0, Math.trunc(input.sampleSize ?? 0));
  const recentSampleSize = Math.max(0, Math.trunc(input.recentSampleSize ?? 0));
  const effectiveSample = sampleSize + Math.min(18, recentSampleSize * 1.4);
  const rawLift = hitRate - baselineProbability;
  const sampleWeight = clamp(effectiveSample / (effectiveSample + 28), 0.08, 0.94);
  const validationWeight =
    typeof input.validationScore === "number"
      ? clamp(input.validationScore / 1000, 0.35, 0.92)
      : 0.55;
  const clvWeight =
    typeof input.avgClv === "number"
      ? clamp(0.5 + Math.max(-12, Math.min(18, input.avgClv)) / 36, 0.2, 0.85)
      : 0.5;
  const closeBeatWeight =
    typeof input.beatCloseRate === "number"
      ? clamp(0.45 + (input.beatCloseRate - 0.5) * 1.2, 0.18, 0.9)
      : 0.5;
  const overlapAdjustment = clamp(1 - (input.overlapPenalty ?? 0), 0.55, 1);
  const reliabilityScore = clamp(
    (sampleWeight * 0.42 + validationWeight * 0.28 + clvWeight * 0.15 + closeBeatWeight * 0.15) * 100,
    6,
    96
  );
  const reliabilityWeight = reliabilityScore / 100;
  const shrunkLift = rawLift * sampleWeight * reliabilityWeight * overlapAdjustment;
  const liftCap = clamp(0.012 + reliabilityWeight * 0.03, 0.012, 0.04);
  const boundedLift = clamp(shrunkLift, -liftCap, liftCap);
  const posteriorProbability = clamp(baselineProbability + boundedLift, 0.02, 0.98);
  const uncertaintyScore = clamp(100 - reliabilityScore + (sampleSize < 20 ? 10 : 0), 4, 96);
  const supportScore = clamp(
    Math.round(reliabilityScore * 0.45 + Math.max(0, boundedLift) * 800),
    0,
    100
  );

  return {
    baselineProbability: round(baselineProbability),
    rawLiftPct: round(rawLift * 100, 2),
    shrunkLiftPct: round(boundedLift * 100, 2),
    posteriorProbability: round(posteriorProbability),
    fairOddsAmerican: fairOddsAmericanFromProbability(posteriorProbability),
    uncertaintyScore: Math.round(uncertaintyScore),
    reliabilityScore: Math.round(reliabilityScore),
    supportScore,
    sampleWeight: round(sampleWeight, 4),
    summary:
      boundedLift === 0
        ? "Trend posterior stayed neutral after shrinkage against the market baseline."
        : `Trend posterior contributed ${boundedLift > 0 ? "+" : ""}${round(boundedLift * 100, 2)} pts after shrinkage and stability weighting.`
  };
}
