import {
  clampNumber,
  clampProbability,
  inverseNormalCdf,
  normalCdf,
  removeTwoWayVig
} from "./probability-math";

export type PropMarketCalibrationInput = {
  modelMean: number;
  modelStdDev: number;
  marketLine?: number | null;
  overOddsAmerican?: number | null;
  underOddsAmerican?: number | null;
  roleConfidence?: number | null;
  sampleSize?: number | null;
  minutesSampleSize?: number | null;
};

export type PropMarketCalibrationResult = {
  adjustedMean: number;
  adjustedStdDev: number;
  modelOverProbability: number | null;
  marketNoVigOverProbability: number | null;
  marketImpliedMean: number | null;
  marketBlendWeight: number;
  modelEdgeProbability: number | null;
  calibratedOverProbability: number | null;
  calibratedUnderProbability: number | null;
  confidence: number;
  notes: string[];
};

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getSampleConfidence(sampleSize?: number | null, minutesSampleSize?: number | null) {
  const statConfidence = validNumber(sampleSize) ? clampNumber(sampleSize / 12, 0, 1) : 0;
  const minuteConfidence = validNumber(minutesSampleSize) ? clampNumber(minutesSampleSize / 10, 0, 1) : statConfidence;
  return clampNumber(statConfidence * 0.55 + minuteConfidence * 0.45, 0, 1);
}

function getModelConfidence(input: PropMarketCalibrationInput) {
  const roleConfidence = validNumber(input.roleConfidence) ? clampNumber(input.roleConfidence, 0, 1) : 0.35;
  const sampleConfidence = getSampleConfidence(input.sampleSize, input.minutesSampleSize);
  const stdPenalty = validNumber(input.modelStdDev) && validNumber(input.marketLine)
    ? clampNumber(Math.abs(input.modelMean - input.marketLine) / Math.max(1, input.modelStdDev), 0, 1)
    : 0;

  return clampNumber(roleConfidence * 0.45 + sampleConfidence * 0.45 + stdPenalty * 0.1, 0.05, 0.95);
}

function getMarketImpliedMean(args: {
  line: number;
  stdDev: number;
  noVigOverProbability: number;
}) {
  // P(Over line) = 1 - CDF(line; mean, sd)
  // CDF(line; mean, sd) = 1 - P(Over)
  // line = mean + z * sd, where z = inverseCDF(1 - P(Over))
  // mean = line - z * sd
  const z = inverseNormalCdf(1 - args.noVigOverProbability);
  return args.line - z * args.stdDev;
}

export function calibratePropProjectionToMarket(input: PropMarketCalibrationInput): PropMarketCalibrationResult {
  const notes: string[] = [];
  const modelStdDev = validNumber(input.modelStdDev) && input.modelStdDev > 0
    ? input.modelStdDev
    : Math.max(1, Math.abs(input.modelMean) * 0.18);

  const confidence = getModelConfidence(input);
  const noVig = removeTwoWayVig(input.overOddsAmerican, input.underOddsAmerican);
  const marketNoVigOverProbability = noVig?.left ?? null;

  let modelOverProbability: number | null = null;
  let marketImpliedMean: number | null = null;
  let adjustedMean = input.modelMean;
  let adjustedStdDev = modelStdDev;
  let marketBlendWeight = 0;

  if (validNumber(input.marketLine)) {
    modelOverProbability = clampProbability(1 - normalCdf(input.marketLine, input.modelMean, modelStdDev), 0.001, 0.999);
  }

  if (validNumber(input.marketLine) && marketNoVigOverProbability !== null) {
    marketImpliedMean = getMarketImpliedMean({
      line: input.marketLine,
      stdDev: modelStdDev,
      noVigOverProbability: marketNoVigOverProbability
    });

    const lowConfidenceBlend = 0.64 * (1 - confidence);
    const baselineMarketRespect = 0.12;
    marketBlendWeight = clampNumber(baselineMarketRespect + lowConfidenceBlend, 0.12, 0.74);
    adjustedMean = input.modelMean * (1 - marketBlendWeight) + marketImpliedMean * marketBlendWeight;

    const disagreement = Math.abs(input.modelMean - marketImpliedMean) / Math.max(1, modelStdDev);
    adjustedStdDev = modelStdDev * clampNumber(1 + disagreement * 0.16 + (1 - confidence) * 0.14, 0.92, 1.32);

    notes.push(`Market calibration blended ${(marketBlendWeight * 100).toFixed(0)}% toward no-vig prop price.`);
    if (confidence < 0.45) {
      notes.push("Low role/sample confidence: market anchor receives heavier weight.");
    }
    if (disagreement >= 0.75) {
      notes.push("Model-market disagreement is material; distribution widened.");
    }
  } else {
    notes.push("No complete two-way prop price available; pure model projection retained.");
  }

  const calibratedOverProbability = validNumber(input.marketLine)
    ? clampProbability(1 - normalCdf(input.marketLine, adjustedMean, adjustedStdDev), 0.001, 0.999)
    : null;
  const calibratedUnderProbability = calibratedOverProbability !== null
    ? clampProbability(1 - calibratedOverProbability, 0.001, 0.999)
    : null;

  return {
    adjustedMean,
    adjustedStdDev,
    modelOverProbability,
    marketNoVigOverProbability,
    marketImpliedMean,
    marketBlendWeight,
    modelEdgeProbability:
      modelOverProbability !== null && marketNoVigOverProbability !== null
        ? modelOverProbability - marketNoVigOverProbability
        : null,
    calibratedOverProbability,
    calibratedUnderProbability,
    confidence,
    notes
  };
}
