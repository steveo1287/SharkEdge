import type { DecisionFusion } from "@/lib/types/decision-fusion";

export type CalibratedFusionDecision = DecisionFusion & {
  calibratedFusedScore: number;
  calibratedTier: "elite" | "strong" | "watchlist" | "pass";
  suppressionReason: string | null;
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calibrateDecisionFusion(fusion: DecisionFusion): CalibratedFusionDecision {
  const penalty =
    fusion.uncertaintyPenalty * 18 +
    fusion.conflictPenalty * 28 +
    fusion.redundancyPenalty * 18;

  const bonus =
    fusion.calibrationScore * 0.32 +
    fusion.regimeFit * 3.8 +
    fusion.incrementalTrendValue * 18;

  const calibratedFusedScore = round(fusion.fusedScore + bonus - penalty);

  let calibratedTier: CalibratedFusionDecision["calibratedTier"] = "pass";
  let suppressionReason: string | null = "Below calibrated promotion threshold.";

  if (calibratedFusedScore >= 9.5) {
    calibratedTier = "elite";
    suppressionReason = null;
  } else if (calibratedFusedScore >= 6) {
    calibratedTier = "strong";
    suppressionReason = null;
  } else if (calibratedFusedScore >= 3) {
    calibratedTier = "watchlist";
    suppressionReason = "Watchlist only; do not promote to top-play or alert surfaces.";
  }

  return {
    ...fusion,
    calibratedFusedScore,
    calibratedTier,
    suppressionReason
  };
}

export function isPromotionEligible(decision: CalibratedFusionDecision) {
  return decision.calibratedTier === "elite" || decision.calibratedTier === "strong";
}
