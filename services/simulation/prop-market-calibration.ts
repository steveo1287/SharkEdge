import {
  clampNumber,
  clampProbability,
  inverseNormalCdf,
  normalCdf,
  removeTwoWayVig
} from "./probability-math";

export type PropMarketCalibrationTuningRule = {
  statKey?: string;
  minPlayableEdge?: number;
  marketBlendAdjustment?: number;
  confidenceAdjustment?: number;
  stdDevMultiplier?: number;
  action?: "TRUST" | "STANDARD" | "CAUTION" | "PASS_ONLY";
};

export type PropMarketCalibrationInput = {
  modelMean: number;
  modelStdDev: number;
  marketLine?: number | null;
  overOddsAmerican?: number | null;
  underOddsAmerican?: number | null;
  roleConfidence?: number | null;
  sampleSize?: number | null;
  minutesSampleSize?: number | null;
  tuningRule?: PropMarketCalibrationTuningRule | null;
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
  minPlayableEdge: number | null;
  tuningAction: PropMarketCalibrationTuningRule["action"] | null;
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
  const baseConfidence = clampNumber(roleConfidence * 0.45 + sampleConfidence * 0.45 + stdPenalty * 0.1, 0.05, 0.95);
  const tuningAdjustment = validNumber(input.tuningRule?.confidenceAdjustment)
    ? input.tuningRule.confidenceAdjustment
    : 0;

  return clampNumber(baseConfidence + tuningAdjustment, 0.03, 0.97);
}

function getMarketImpliedMean(args: {
  line: number;
  stdDev: number;
  noVigOverProbability: number;
}) {
  const z = inverseNormalCdf(1 - args.noVigOverProbability);
  return args.line - z * args.stdDev;
}

export function calibratePropProjectionToMarket(input: PropMarketCalibrationInput): PropMarketCalibrationResult {
  const notes: string[] = [];
  const tuningRule = input.tuningRule ?? null;
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
  const minPlayableEdge = validNumber(tuningRule?.minPlayableEdge) ? tuningRule.minPlayableEdge : null;

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
    const tuningBlendAdjustment = validNumber(tuningRule?.marketBlendAdjustment) ? tuningRule.marketBlendAdjustment : 0;
    marketBlendWeight = clampNumber(baselineMarketRespect + lowConfidenceBlend + tuningBlendAdjustment, 0.06, 0.86);
    adjustedMean = input.modelMean * (1 - marketBlendWeight) + marketImpliedMean * marketBlendWeight;

    const disagreement = Math.abs(input.modelMean - marketImpliedMean) / Math.max(1, modelStdDev);
    const tuningStdDevMultiplier = validNumber(tuningRule?.stdDevMultiplier) ? tuningRule.stdDevMultiplier : 1;
    adjustedStdDev = modelStdDev * clampNumber(1 + disagreement * 0.16 + (1 - confidence) * 0.14, 0.92, 1.32) * clampNumber(tuningStdDevMultiplier, 0.9, 1.3);

    notes.push(`Market calibration blended ${(marketBlendWeight * 100).toFixed(0)}% toward no-vig prop price.`);
    if (confidence < 0.45) {
      notes.push("Low role/sample confidence: market anchor receives heavier weight.");
    }
    if (disagreement >= 0.75) {
      notes.push("Model-market disagreement is material; distribution widened.");
    }
    if (tuningRule?.action) {
      notes.push(`Model tuning action ${tuningRule.action}; min playable edge ${((minPlayableEdge ?? 0) * 100).toFixed(1)}%.`);
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
    minPlayableEdge,
    tuningAction: tuningRule?.action ?? null,
    notes
  };
}
