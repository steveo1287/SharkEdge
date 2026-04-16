import type { MlbPromotionDecision } from "@/lib/types/mlb-promotion";
import type { MlbCalibratedOutcome } from "@/lib/types/mlb-outcome-math";
import type { MlbDecisionGate } from "@/services/modeling/mlb-conformal-gating-service";
import type { MlbIntelligenceEnvelope } from "@/lib/types/mlb-intelligence";
import type { MlbPrimaryDecisionScore } from "@/services/modeling/mlb-decision-score-service";

type OrchestratorInput = {
  outcomeMath: MlbCalibratedOutcome;
  gate: MlbDecisionGate;
  envelope: MlbIntelligenceEnvelope;
  primaryDecision: MlbPrimaryDecisionScore;
  marketImpliedProb?: number | null;
  lineupCertainty?: number;
  starterCertainty?: number;
  bullpenCertainty?: number;
  weatherCertainty?: number;
  trendConfirmationScore?: number;
};

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildMlbPromotionDecision(input: OrchestratorInput): MlbPromotionDecision {
  const strongestModelSide = Math.max(
    input.outcomeMath.calibrated.homeWinProb,
    input.outcomeMath.calibrated.awayWinProb
  );

  const marketImpliedProb = input.marketImpliedProb ?? 0.5;
  const marketDisagreement = round(strongestModelSide - marketImpliedProb, 4);

  const certaintyScore = round(
    clamp(
      (input.lineupCertainty ?? 0.72) * 0.35 +
        (input.starterCertainty ?? 0.84) * 0.35 +
        (input.bullpenCertainty ?? 0.66) * 0.15 +
        (input.weatherCertainty ?? 0.7) * 0.15,
      0,
      1
    ),
    4
  );

  const trendInfluence = clamp(input.trendConfirmationScore ?? 0.04, -0.04, 0.08);
  const explanationConsistency = round(
    clamp(
      input.envelope.explanationStability * 0.45 +
        input.outcomeMath.marketAgreement * 0.3 +
        certaintyScore * 0.2 +
        (0.5 + trendInfluence) * 0.05 -
        Math.abs(marketDisagreement) * 0.2,
      0,
      1
    ),
    4
  );

  const qualificationModifier =
    input.gate.decision === "elite"
      ? 1.08
      : input.gate.decision === "strong"
        ? 1.03
        : input.gate.decision === "watchlist"
          ? 0.94
          : 0.82;

  const finalPromotionScore = round(
    input.primaryDecision.primaryScore *
      input.outcomeMath.marketAgreement *
      input.envelope.explanationStability *
      (1 - input.envelope.uncertaintyPenalty) *
      qualificationModifier *
      explanationConsistency *
      certaintyScore
  );

  let tier: MlbPromotionDecision["tier"] = "pass";
  let isSuppressed = true;
  const rationale: string[] = [];

  if (finalPromotionScore >= 5.5 && input.primaryDecision.promotionTier === "elite") {
    tier = "elite";
    isSuppressed = false;
    rationale.push("Final score clears elite promotion threshold.");
  } else if (finalPromotionScore >= 3.5 && (input.primaryDecision.promotionTier === "elite" || input.primaryDecision.promotionTier === "strong")) {
    tier = "strong";
    isSuppressed = false;
    rationale.push("Final score clears strong promotion threshold.");
  } else if (finalPromotionScore >= 2) {
    tier = "watchlist";
    rationale.push("Keep visible, but below strong promotion quality.");
  } else {
    tier = "pass";
    rationale.push("Suppress from top promotion surfaces by default.");
  }

  if (certaintyScore < 0.66) {
    rationale.push("Lineup/starter/weather certainty is not yet strong enough.");
  }
  if (Math.abs(marketDisagreement) > 0.09) {
    rationale.push("Large model-market disagreement increases suspicion rather than confidence.");
  }
  if (explanationConsistency < 0.68) {
    rationale.push("Signals are not consistent enough for aggressive promotion.");
  }

  return {
    finalPromotionScore,
    tier,
    isSuppressed,
    marketDisagreement,
    explanationConsistency,
    certaintyScore,
    rationale
  };
}
