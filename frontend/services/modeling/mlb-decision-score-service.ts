import type { MlbCalibratedOutcome } from "@/lib/types/mlb-outcome-math";
import type { MlbDecisionGate } from "@/services/modeling/mlb-conformal-gating-service";

export type MlbPrimaryDecisionScore = {
  primaryScore: number;
  promotionTier: "elite" | "strong" | "watchlist" | "pass";
  reason: string;
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

export function buildMlbPrimaryDecisionScore(
  outcome: MlbCalibratedOutcome,
  gate: MlbDecisionGate
): MlbPrimaryDecisionScore {
  const strongestSide = Math.max(outcome.calibrated.homeWinProb, outcome.calibrated.awayWinProb);
  const strongestTotal = Math.max(outcome.calibrated.overProb, outcome.calibrated.underProb);
  const directionalEdge = Math.max(strongestSide - 0.5, strongestTotal - 0.5);

  const primaryScore = round(
    directionalEdge *
      outcome.marketAgreement *
      (1 - outcome.calibrationPenalty) *
      gate.gatedRankMultiplier *
      100
  );

  let promotionTier: MlbPrimaryDecisionScore["promotionTier"] = "pass";
  let reason = "Probability edge does not survive calibrated decision thresholds.";

  if (gate.decision === "elite" && primaryScore >= 8.5) {
    promotionTier = "elite";
    reason = "Calibrated outcome math and stability both clear elite thresholds.";
  } else if ((gate.decision === "elite" || gate.decision === "strong") && primaryScore >= 5.5) {
    promotionTier = "strong";
    reason = "Calibrated outcome math supports promotion with acceptable stability.";
  } else if (primaryScore >= 3.25) {
    promotionTier = "watchlist";
    reason = "There is a signal, but it remains below strong promotion quality.";
  }

  return {
    primaryScore,
    promotionTier,
    reason
  };
}
