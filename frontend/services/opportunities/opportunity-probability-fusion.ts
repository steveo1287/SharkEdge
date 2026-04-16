import { americanToImpliedProbability, fairOddsAmericanFromProbability } from "@/lib/math/core";
import type {
  MarketEfficiencyClass,
  OpportunityProbabilityEvidenceLane,
  OpportunityProbabilityFusionView,
  OpportunityTrapFlag
} from "@/lib/types/opportunity";
import type { ReasonAttributionView } from "@/lib/types/domain";
import { calibrateProbabilityAgainstMarket } from "@/services/modeling/probability-calibration";

type BuildOpportunityProbabilityFusionArgs = {
  fairPriceAmerican: number | null;
  marketProbability: number | null;
  expectedValuePct: number | null;
  reasons: ReasonAttributionView[];
  trapFlags: OpportunityTrapFlag[];
  confidenceScore: number;
  marketEfficiency: MarketEfficiencyClass;
  truthCalibrationScoreDelta?: number;
  reasonCalibrationScoreDelta?: number;
  marketPathScoreDelta?: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function buildTrendLiftPct(reasons: ReasonAttributionView[]) {
  const contribution = reasons.slice(0, 4).reduce((total, reason) => {
    if (reason.category === "trend_support") return total + 0.012;
    if (reason.category === "model_edge") return total + 0.008;
    if (reason.category === "market_edge") return total + 0.006;
    if (reason.category === "momentum_edge") return total + 0.004;
    return total;
  }, 0);

  return clamp(contribution, -0.02, 0.035);
}

function buildUncertaintyScore(args: {
  trapFlags: OpportunityTrapFlag[];
  confidenceScore: number;
  marketEfficiency: MarketEfficiencyClass;
  marketProbability: number | null;
}) {
  let uncertainty = 34;

  if (args.marketProbability === null) uncertainty += 14;
  if (args.marketEfficiency === "HIGH_EFFICIENCY") uncertainty += 10;
  if (args.marketEfficiency === "FRAGMENTED_PROP" || args.marketEfficiency === "THIN_SPECIALTY") uncertainty += 12;
  if (args.trapFlags.includes("LOW_CONFIDENCE_FAIR_PRICE")) uncertainty += 16;
  if (args.trapFlags.includes("HIGH_MARKET_DISAGREEMENT")) uncertainty += 12;
  if (args.trapFlags.includes("MODEL_MARKET_CONFLICT")) uncertainty += 10;
  if (args.trapFlags.includes("INJURY_UNCERTAINTY")) uncertainty += 8;

  uncertainty -= clamp((args.confidenceScore - 50) * 0.45, -8, 18);

  return clamp(Math.round(uncertainty), 8, 96);
}

function buildEvidenceLanes(args: {
  modelProbability: number | null;
  marketProbability: number | null;
  trendLiftPct: number;
  calibrationDelta: number;
  posteriorProbability: number | null;
}): OpportunityProbabilityEvidenceLane[] {
  const lanes: OpportunityProbabilityEvidenceLane[] = [];

  if (args.modelProbability !== null) {
    lanes.push({
      lane: "model_prior",
      label: "Model prior",
      direction: "POSITIVE",
      magnitude: 1,
      reliability: 66,
      uncertainty: 28,
      note: `Fair-price model implies ${(args.modelProbability * 100).toFixed(2)}%.`
    });
  }

  if (args.marketProbability !== null) {
    lanes.push({
      lane: "market_baseline",
      label: "Market baseline",
      direction: "NEUTRAL",
      magnitude: 1,
      reliability: 82,
      uncertainty: 16,
      note: `Consensus market implies ${(args.marketProbability * 100).toFixed(2)}%.`
    });
  }

  if (args.trendLiftPct !== 0) {
    lanes.push({
      lane: "trend_context",
      label: "Trend context",
      direction: args.trendLiftPct > 0 ? "POSITIVE" : "NEGATIVE",
      magnitude: round(Math.abs(args.trendLiftPct) * 100, 2),
      reliability: 54,
      uncertainty: 42,
      note: `Context lift contributed ${args.trendLiftPct > 0 ? "+" : ""}${(args.trendLiftPct * 100).toFixed(2)} pts before calibration.`
    });
  }

  if (args.calibrationDelta !== 0 && args.posteriorProbability !== null && args.modelProbability !== null) {
    lanes.push({
      lane: "truth_calibration",
      label: "Calibration",
      direction: args.calibrationDelta > 0 ? "POSITIVE" : "NEGATIVE",
      magnitude: Math.abs(args.calibrationDelta),
      reliability: 72,
      uncertainty: 24,
      note: `Calibration moved the posterior by ${args.calibrationDelta > 0 ? "+" : ""}${args.calibrationDelta.toFixed(2)} pts.`
    });
  }

  return lanes;
}

export function buildOpportunityProbabilityFusion(
  args: BuildOpportunityProbabilityFusionArgs
): OpportunityProbabilityFusionView {
  const modelProbability = americanToImpliedProbability(args.fairPriceAmerican);
  const trendLiftPct = buildTrendLiftPct(args.reasons);
  const marketProbability =
    typeof args.marketProbability === "number" && Number.isFinite(args.marketProbability)
      ? clamp(args.marketProbability, 0.001, 0.999)
      : null;
  const uncertaintyScore = buildUncertaintyScore({
    trapFlags: args.trapFlags,
    confidenceScore: args.confidenceScore,
    marketEfficiency: args.marketEfficiency,
    marketProbability
  });
  const adjustedModelProbability =
    typeof modelProbability === "number"
      ? clamp(modelProbability + trendLiftPct, 0.001, 0.999)
      : null;
  const calibrationBias =
    (args.truthCalibrationScoreDelta ?? 0) * 0.0015 +
    (args.reasonCalibrationScoreDelta ?? 0) * 0.001 +
    (args.marketPathScoreDelta ?? 0) * 0.001;

  const calibrated = calibrateProbabilityAgainstMarket({
    modelProbability: adjustedModelProbability,
    marketProbability,
    sourceConfidence: clamp(0.56 + (args.confidenceScore - 50) / 120, 0.22, 0.92),
    uncertaintyScore
  });

  const posteriorProbability =
    calibrated.posteriorProbability === null
      ? null
      : clamp(calibrated.posteriorProbability + calibrationBias, 0.001, 0.999);
  const posteriorEdgePct =
    posteriorProbability !== null && marketProbability !== null
      ? round((posteriorProbability - marketProbability) * 100, 2)
      : null;
  const calibrationDelta =
    posteriorProbability !== null && adjustedModelProbability !== null
      ? (posteriorProbability - adjustedModelProbability) * 100
      : 0;

  return {
    status: posteriorProbability === null ? "SKIPPED_NO_MODEL" : "APPLIED",
    rawModelProbability:
      adjustedModelProbability === null ? null : round(adjustedModelProbability),
    marketProbability: marketProbability === null ? null : round(marketProbability),
    posteriorProbability: posteriorProbability === null ? null : round(posteriorProbability),
    posteriorFairOddsAmerican: fairOddsAmericanFromProbability(posteriorProbability),
    posteriorEdgePct,
    trendLiftPct: round(trendLiftPct * 100, 2),
    uncertaintyScore: calibrated.uncertaintyScore,
    confidencePenalty: calibrated.confidencePenalty,
    modelWeight: calibrated.modelWeight,
    marketWeight: calibrated.marketWeight,
    evidenceLanes: buildEvidenceLanes({
      modelProbability: adjustedModelProbability,
      marketProbability,
      trendLiftPct,
      calibrationDelta,
      posteriorProbability
    }),
    summary:
      posteriorProbability === null
        ? "Probability fusion skipped because no fair-price model probability was available."
        : `Posterior landed at ${(posteriorProbability * 100).toFixed(2)}% with ${Math.round(calibrated.modelWeight * 100)}/${Math.round(calibrated.marketWeight * 100)} model-market weighting.`
  };
}
