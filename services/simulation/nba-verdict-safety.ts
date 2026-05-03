import type { ActionState, MarketVerdict, VerdictConfidence, VerdictRating } from "@/services/simulation/sim-verdict-engine";

const LOW_TRUST_CONFIDENCE = new Set<VerdictConfidence>(["LOW", "INSUFFICIENT"]);

function capKellyPct(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(value, 0.5);
}

function downgradeRatingForNoBet(rating: VerdictRating): VerdictRating {
  if (rating === "STRONG_BET") return "LEAN";
  if (rating === "LEAN") return "NEUTRAL";
  return rating;
}

function actionForNoBet(actionState: ActionState): ActionState {
  if (actionState === "BET_NOW") return "WATCH";
  if (actionState === "WAIT") return "WATCH";
  return actionState === "PASS" ? "PASS" : "WATCH";
}

export type NbaVerdictSafetyInput = {
  verdict: MarketVerdict;
  modelHealthGreen: boolean;
  sourceHealthGreen: boolean;
  injuryReportFresh: boolean;
  calibrationBucketHealthy: boolean;
  noVigMarketAvailable: boolean;
  noBet?: boolean;
  blockerReasons?: string[];
};

export function applyNbaVerdictSafety(input: NbaVerdictSafetyInput): MarketVerdict {
  const blockers = [
    ...(!input.modelHealthGreen ? ["NBA model health is not GREEN."] : []),
    ...(!input.sourceHealthGreen ? ["NBA source health is not GREEN."] : []),
    ...(!input.injuryReportFresh ? ["NBA injury report is stale or unavailable."] : []),
    ...(!input.calibrationBucketHealthy ? ["NBA calibration bucket is not healthy."] : []),
    ...(!input.noVigMarketAvailable ? ["NBA no-vig market baseline is unavailable."] : []),
    ...(input.noBet ? ["NBA upstream guard marked this output noBet."] : []),
    ...(input.blockerReasons ?? [])
  ];
  const lowTrust = LOW_TRUST_CONFIDENCE.has(input.verdict.confidence);
  const forceNoBet = blockers.length > 0 || lowTrust;

  if (!forceNoBet) {
    return {
      ...input.verdict,
      kellyPct: capKellyPct(input.verdict.kellyPct)
    };
  }

  const lowTrustReason = lowTrust ? [`NBA confidence ${input.verdict.confidence} cannot produce STRONG_BET or Kelly.`] : [];
  const reasonText = [...blockers, ...lowTrustReason].join(" ");
  const rating = input.verdict.rating === "STRONG_BET" || input.verdict.rating === "LEAN"
    ? downgradeRatingForNoBet(input.verdict.rating)
    : input.verdict.rating;

  return {
    ...input.verdict,
    rating,
    actionState: actionForNoBet(input.verdict.actionState),
    kellyPct: 0,
    headline: input.verdict.headline,
    explanation: `${input.verdict.explanation} NBA safety gate: ${reasonText}`.trim(),
    trapFlags: [...new Set([...input.verdict.trapFlags, "LOW_CONFIDENCE_FAIR_PRICE"])] as MarketVerdict["trapFlags"],
    trapExplanation: input.verdict.trapExplanation ?? reasonText || "NBA safety gate blocked action."
  };
}

export function applyNbaVerdictSafetyToList(verdicts: MarketVerdict[], input: Omit<NbaVerdictSafetyInput, "verdict">) {
  return verdicts.map((verdict) => applyNbaVerdictSafety({ ...input, verdict }));
}
