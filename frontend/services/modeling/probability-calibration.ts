import { fairOddsAmericanFromProbability } from "@/lib/math/core";

type CalibrationInput = {
  modelProbability: number | null;
  marketProbability: number | null;
  sampleSize?: number | null;
  sourceConfidence?: number | null;
  uncertaintyScore?: number | null;
};

export type ProbabilityCalibrationView = {
  rawProbability: number | null;
  marketProbability: number | null;
  posteriorProbability: number | null;
  posteriorFairOddsAmerican: number | null;
  modelWeight: number;
  marketWeight: number;
  disagreementPct: number | null;
  uncertaintyScore: number;
  confidencePenalty: number;
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
  return clamp(value, 0.001, 0.999);
}

export function calibrateProbabilityAgainstMarket(
  input: CalibrationInput
): ProbabilityCalibrationView {
  const modelProbability = normalizeProbability(input.modelProbability);
  const marketProbability = normalizeProbability(input.marketProbability);
  const uncertaintyScore = clamp(input.uncertaintyScore ?? 32, 0, 100);

  if (modelProbability === null) {
    return {
      rawProbability: null,
      marketProbability,
      posteriorProbability: marketProbability,
      posteriorFairOddsAmerican: fairOddsAmericanFromProbability(marketProbability),
      modelWeight: 0,
      marketWeight: marketProbability === null ? 0 : 1,
      disagreementPct: null,
      uncertaintyScore,
      confidencePenalty: clamp(Math.round(uncertaintyScore * 0.18) + 8, 0, 24),
      summary: "Calibration fell back because no model probability was available."
    };
  }

  if (marketProbability === null) {
    return {
      rawProbability: modelProbability,
      marketProbability: null,
      posteriorProbability: modelProbability,
      posteriorFairOddsAmerican: fairOddsAmericanFromProbability(modelProbability),
      modelWeight: 1,
      marketWeight: 0,
      disagreementPct: null,
      uncertaintyScore,
      confidencePenalty: clamp(Math.round(uncertaintyScore * 0.14), 0, 18),
      summary: "Calibration stayed model-led because no market baseline was available."
    };
  }

  const sampleFactor =
    typeof input.sampleSize === "number"
      ? clamp(Math.sqrt(Math.max(1, input.sampleSize)) / 22, 0.28, 1)
      : 0.58;
  const sourceConfidence = clamp(input.sourceConfidence ?? 0.66, 0.18, 0.96);
  const disagreement = Math.abs(modelProbability - marketProbability);
  const disagreementPenalty = clamp(disagreement * 1.65, 0, 0.4);
  const uncertaintyPenalty = clamp(uncertaintyScore / 100, 0, 1) * 0.36;
  const modelWeight = clamp(
    sourceConfidence * sampleFactor * (1 - disagreementPenalty) * (1 - uncertaintyPenalty),
    0.18,
    0.88
  );
  const marketWeight = clamp(1 - modelWeight, 0.12, 0.82);
  const posteriorProbability = clamp(
    modelProbability * modelWeight + marketProbability * marketWeight,
    0.001,
    0.999
  );
  const confidencePenalty = clamp(
    Math.round((uncertaintyScore * 0.12) + disagreement * 35),
    0,
    24
  );

  return {
    rawProbability: round(modelProbability),
    marketProbability: round(marketProbability),
    posteriorProbability: round(posteriorProbability),
    posteriorFairOddsAmerican: fairOddsAmericanFromProbability(posteriorProbability),
    modelWeight: round(modelWeight),
    marketWeight: round(marketWeight),
    disagreementPct: round(disagreement * 100, 2),
    uncertaintyScore: Math.round(uncertaintyScore),
    confidencePenalty,
    summary:
      disagreement < 0.01
        ? "Calibration confirmed the model because it already sat near market consensus."
        : `Calibration blended model and market with ${Math.round(modelWeight * 100)}/${Math.round(marketWeight * 100)} weighting.`
  };
}
