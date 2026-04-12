import { americanToDecimalOdds, americanToImpliedProbability, calculateKellyFraction } from "@/lib/math";
import type { ProviderHealthState } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
  OpportunityActionState,
  OpportunityBankrollSettings,
  OpportunityConfidenceTier,
  OpportunityCloseDestinationView,
  OpportunityEdgeDecayView,
  OpportunityExecutionCapacityView,
  OpportunityMarketMicrostructureView,
  OpportunitySizingConfidence,
  OpportunitySizingReasonCode,
  OpportunityTrapFlag,
  PositionSizeRecommendation,
  PositionSizingGuidance
} from "@/lib/types/opportunity";
import { buildDefaultBankrollSettings } from "@/services/account/user-service";

type BuildPositionSizingGuidanceArgs = {
  opportunityScore: number;
  confidenceTier: OpportunityConfidenceTier;
  trapFlags: OpportunityTrapFlag[];
  bookCount: number;
  providerFreshnessMinutes: number | null;
  marketDisagreementScore: number | null;
  marketEfficiency: MarketEfficiencyClass;
  bestPriceFlag: boolean;
  edgeDecay: OpportunityEdgeDecayView;
  expectedValuePct: number | null;
  fairPriceAmerican: number | null;
  displayOddsAmerican: number | null;
  actionState: OpportunityActionState;
  sourceQualityScore: number;
  sourceHealthState: ProviderHealthState;
  truthCalibrationScoreDelta?: number;
  marketMicrostructure?: OpportunityMarketMicrostructureView | null;
  closeDestination?: OpportunityCloseDestinationView | null;
  executionCapacity?: OpportunityExecutionCapacityView | null;
  bankrollSettings?: OpportunityBankrollSettings | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function hasAnyTrap(
  trapFlags: OpportunityTrapFlag[],
  candidates: OpportunityTrapFlag[]
) {
  return candidates.some((flag) => trapFlags.includes(flag));
}

function getRecommendation(bankrollPct: number): PositionSizeRecommendation {
  if (bankrollPct <= 0) {
    return "NO_BET";
  }

  if (bankrollPct < 0.25) {
    return "MICRO";
  }

  if (bankrollPct < 0.8) {
    return "SMALL";
  }

  if (bankrollPct < 1.6) {
    return "STANDARD";
  }

  return "AGGRESSIVE";
}

function getLabel(recommendation: PositionSizeRecommendation) {
  switch (recommendation) {
    case "AGGRESSIVE":
      return "Aggressive";
    case "STANDARD":
      return "Standard";
    case "SMALL":
      return "Small";
    case "MICRO":
      return "Micro";
    case "NO_BET":
      return "No bet";
  }
}

function deriveFairProbability(args: {
  fairPriceAmerican: number | null;
  displayOddsAmerican: number | null;
  expectedValuePct: number | null;
}) {
  const directFairProbability = americanToImpliedProbability(args.fairPriceAmerican);
  if (typeof directFairProbability === "number") {
    return directFairProbability;
  }

  const decimalOdds = americanToDecimalOdds(args.displayOddsAmerican);
  const evPct = args.expectedValuePct;
  if (
    typeof decimalOdds !== "number" ||
    typeof evPct !== "number" ||
    decimalOdds <= 1
  ) {
    return null;
  }

  const derivedProbability = (1 + evPct / 100) / decimalOdds;
  if (!Number.isFinite(derivedProbability)) {
    return null;
  }

  return clamp(derivedProbability, 0, 0.99);
}

function getConfidenceFactor(confidenceTier: OpportunityConfidenceTier) {
  switch (confidenceTier) {
    case "A":
      return 1;
    case "B":
      return 0.86;
    case "C":
      return 0.68;
    case "D":
      return 0.42;
  }
}

function getBookDepthFactor(bookCount: number) {
  if (bookCount >= 6) {
    return 1;
  }

  if (bookCount >= 4) {
    return 0.9;
  }

  if (bookCount === 3) {
    return 0.78;
  }

  if (bookCount === 2) {
    return 0.62;
  }

  return 0.42;
}

function getDisagreementFactor(disagreementScore: number | null) {
  const disagreement = disagreementScore ?? 0;
  if (disagreement >= 0.18) {
    return 0.42;
  }

  if (disagreement >= 0.12) {
    return 0.58;
  }

  if (disagreement >= 0.08) {
    return 0.76;
  }

  if (disagreement >= 0.04) {
    return 0.9;
  }

  return 1;
}

function getEfficiencyFactor(efficiency: MarketEfficiencyClass) {
  switch (efficiency) {
    case "HIGH_EFFICIENCY":
      return 0.72;
    case "MID_EFFICIENCY":
      return 0.86;
    case "LOW_EFFICIENCY":
      return 0.96;
    case "FRAGMENTED_PROP":
      return 0.68;
    case "THIN_SPECIALTY":
      return 0.56;
  }
}

function getFreshnessFactor(
  freshnessMinutes: number | null,
  sourceHealthState: ProviderHealthState
) {
  const healthFactor =
    sourceHealthState === "HEALTHY"
      ? 1
      : sourceHealthState === "DEGRADED"
        ? 0.78
        : sourceHealthState === "FALLBACK"
          ? 0.62
          : 0.35;

  if (freshnessMinutes === null) {
    return 0.72 * healthFactor;
  }

  if (freshnessMinutes <= 3) {
    return healthFactor;
  }

  if (freshnessMinutes <= 8) {
    return 0.92 * healthFactor;
  }

  if (freshnessMinutes <= 15) {
    return 0.8 * healthFactor;
  }

  if (freshnessMinutes <= 30) {
    return 0.66 * healthFactor;
  }

  return 0.45 * healthFactor;
}

function getDecayFactor(args: {
  edgeDecay: OpportunityEdgeDecayView;
  actionState: OpportunityActionState;
  marketMicrostructure?: OpportunityMarketMicrostructureView | null;
}) {
  if (args.actionState === "PASS" || args.actionState === "WATCH") {
    return 0;
  }

  if (args.actionState === "WAIT") {
    return 0;
  }

  const staleCopyConfirmed =
    args.marketMicrostructure?.status === "APPLIED" &&
    args.marketMicrostructure.regime === "STALE_COPY" &&
    args.marketMicrostructure.staleCopyConfidence >= 70;

  switch (args.edgeDecay.label) {
    case "FRESH":
      return staleCopyConfirmed ? 1.06 : 1;
    case "AGING":
      return staleCopyConfirmed ? 0.94 : 0.84;
    case "DECAYING":
      return staleCopyConfirmed ? 0.82 : 0.62;
    case "COMPRESSED":
      return staleCopyConfirmed ? 0.74 : 0.5;
    case "STALE":
      return 0.25;
  }
}

function getCalibrationFactor(scoreDelta: number | undefined) {
  const delta = scoreDelta ?? 0;
  if (delta >= 4) {
    return 1.08;
  }

  if (delta >= 2) {
    return 1.04;
  }

  if (delta <= -4) {
    return 0.78;
  }

  if (delta <= -2) {
    return 0.88;
  }

  return 1;
}

function getSourceFactor(sourceQualityScore: number) {
  return clamp(0.55 + sourceQualityScore / 120, 0.45, 1.05);
}

function getMicrostructureFactor(
  marketMicrostructure: OpportunityMarketMicrostructureView | null | undefined
) {
  if (!marketMicrostructure || marketMicrostructure.status !== "APPLIED") {
    return 1;
  }

  if (marketMicrostructure.regime === "STALE_COPY") {
    return marketMicrostructure.staleCopyConfidence >= 75 ? 1.08 : 1.02;
  }

  if (marketMicrostructure.regime === "FRAGMENTED") {
    return 0.72;
  }

  if (marketMicrostructure.decayRiskBucket === "IMPROVEMENT_PRONE") {
    return 0.82;
  }

  if (marketMicrostructure.regime === "LEADER_CONFIRMED") {
    return 1.03;
  }

  return 0.94;
}

function getDestinationFactor(
  closeDestination: OpportunityCloseDestinationView | null | undefined
) {
  if (!closeDestination || closeDestination.status !== "APPLIED") {
    return 1;
  }

  return clamp(closeDestination.sizingMultiplier, 0.6, 1.1);
}

function getExecutionCapacityFactor(
  executionCapacity: OpportunityExecutionCapacityView | null | undefined
) {
  if (!executionCapacity || executionCapacity.status !== "APPLIED") {
    return 1;
  }

  return clamp(executionCapacity.stakeMultiplier, 0.2, 1);
}

function getSizingConfidence(args: {
  confidenceTier: OpportunityConfidenceTier;
  marketDisagreementScore: number | null;
  sourceQualityScore: number;
  truthCalibrationScoreDelta?: number;
  marketMicrostructure?: OpportunityMarketMicrostructureView | null;
}): OpportunitySizingConfidence {
  if (
    args.confidenceTier === "A" &&
    (args.marketDisagreementScore ?? 0) <= 0.06 &&
    args.sourceQualityScore >= 70 &&
    (args.truthCalibrationScoreDelta ?? 0) >= 0 &&
    args.marketMicrostructure?.status !== "SKIPPED_WEAK_PATH"
  ) {
    return "HIGH";
  }

  if (
    args.confidenceTier === "D" ||
    (args.marketDisagreementScore ?? 0) >= 0.14 ||
    args.sourceQualityScore < 45
  ) {
    return "LOW";
  }

  return "MEDIUM";
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function buildRiskFlags(reasonCodes: OpportunitySizingReasonCode[]) {
  const flags = reasonCodes.map((code) => {
    switch (code) {
      case "BEST_PRICE_UNCONFIRMED":
        return "Best price is not confirmed.";
      case "HIGH_MARKET_DISAGREEMENT":
        return "Books are split enough to reduce conviction.";
      case "LOW_SOURCE_QUALITY":
        return "Source quality is not strong enough for full size.";
      case "HIGH_EFFICIENCY_CAP":
        return "Efficient market structure caps Kelly aggression.";
      case "FRAGMENTED_MARKET_CAP":
        return "Fragmented market behavior forces a smaller stake.";
      case "FAST_DECAY_CAP":
        return "Fast edge decay forces a smaller stake.";
      case "DESTINATION_IMPROVE_CAP":
        return "Replay and destination guidance suggest better entry can develop later.";
      case "DESTINATION_MOSTLY_PRICED_CAP":
        return "Destination guidance says most of the edge is already priced.";
      case "EXECUTION_CAPACITY_SCREEN_ONLY":
        return "Displayed edge looks more like screen value than deployable size.";
      case "EXECUTION_CAPACITY_FRAGILE":
        return "Execution capacity is real but fragile, so size stays small.";
      case "EXECUTION_RISK_CAP":
        return "Execution quality risk forced a size reduction.";
      case "TRAP_CAPPED":
        return "Trap posture capped the size.";
      case "ACTION_WAIT_NO_ALLOCATION":
        return "WAIT posture means no live allocation yet.";
      case "ACTION_WATCH_NO_ALLOCATION":
        return "WATCH posture means no live allocation yet.";
      case "ACTION_PASS_NO_ALLOCATION":
        return "PASS posture blocks allocation.";
      case "THESIS_CLUSTER_DUPLICATE":
        return "A stronger version of this thesis already exists on the board.";
      case "THESIS_CLUSTER_CORRELATED":
        return "This bet overlaps a thesis cluster that is already active.";
      default:
        return null;
    }
  });

  return flags.filter((flag) => flag !== null) as string[];
}

function buildRationale(args: {
  recommendation: PositionSizeRecommendation;
  baseKellyFraction: number;
  adjustedKellyFraction: number;
  bankrollPct: number;
  reasonCodes: OpportunitySizingReasonCode[];
}) {
  if (args.recommendation === "NO_BET") {
    return args.reasonCodes.includes("ACTION_WAIT_NO_ALLOCATION")
      ? "The edge can stay on the board, but WAIT posture means capital stays uncommitted for now."
      : "Kelly clears only after uncertainty discounts, so the allocator keeps this at zero.";
  }

  return `${getLabel(args.recommendation)} stake after fractional Kelly moved from ${(args.baseKellyFraction * 100).toFixed(2)}% to ${(args.adjustedKellyFraction * 100).toFixed(2)}% of bankroll, leaving ${(args.bankrollPct).toFixed(2)}% actually allocated.`;
}

export function buildPositionSizingGuidance(
  args: BuildPositionSizingGuidanceArgs
): PositionSizingGuidance {
  const bankrollSettings = args.bankrollSettings ?? buildDefaultBankrollSettings();
  const fairProbability = deriveFairProbability({
    fairPriceAmerican: args.fairPriceAmerican,
    displayOddsAmerican: args.displayOddsAmerican,
    expectedValuePct: args.expectedValuePct
  });
  const rawKellyFraction =
    fairProbability !== null
      ? calculateKellyFraction({
          oddsAmerican: args.displayOddsAmerican,
          fairProbability,
          fraction: 1
        }) ?? 0
      : 0;
  const baseKellyFraction = round(
    rawKellyFraction * bankrollSettings.baseKellyFraction,
    6
  );
  const reasonCodes: OpportunitySizingReasonCode[] = [];

  if (fairProbability === null) {
    reasonCodes.push("NO_FAIR_PRICE");
  }

  if (typeof args.displayOddsAmerican !== "number") {
    reasonCodes.push("NO_MARKET_PRICE");
  }

  if (baseKellyFraction <= 0) {
    reasonCodes.push("KELLY_ZERO");
  }

  if (!args.bestPriceFlag) {
    reasonCodes.push("BEST_PRICE_UNCONFIRMED");
  }

  if ((args.marketDisagreementScore ?? 0) >= 0.12) {
    reasonCodes.push("HIGH_MARKET_DISAGREEMENT");
  }

  if (args.sourceQualityScore < 55) {
    reasonCodes.push("LOW_SOURCE_QUALITY");
  }

  if (args.marketEfficiency === "HIGH_EFFICIENCY") {
    reasonCodes.push("HIGH_EFFICIENCY_CAP");
  }

  if (
    args.marketEfficiency === "FRAGMENTED_PROP" ||
    args.marketEfficiency === "THIN_SPECIALTY"
  ) {
    reasonCodes.push("FRAGMENTED_MARKET_CAP");
  }

  if (args.edgeDecay.label === "DECAYING" || args.edgeDecay.label === "COMPRESSED") {
    reasonCodes.push("FAST_DECAY_CAP");
  }

  if (args.closeDestination?.status === "APPLIED") {
    if (args.closeDestination.label === "IMPROVE") {
      reasonCodes.push("DESTINATION_IMPROVE_CAP");
    } else if (args.closeDestination.label === "MOSTLY_PRICED") {
      reasonCodes.push("DESTINATION_MOSTLY_PRICED_CAP");
    } else if (args.closeDestination.label === "DECAY") {
      reasonCodes.push("DESTINATION_DECAY_SUPPORT");
    }
  }

  const criticalTrap =
    hasAnyTrap(args.trapFlags, [
      "STALE_EDGE",
      "LOW_PROVIDER_HEALTH",
      "ONE_BOOK_OUTLIER",
      "MODEL_MARKET_CONFLICT"
    ]) || args.sourceHealthState === "OFFLINE";
  if (criticalTrap || args.trapFlags.length >= 2) {
    reasonCodes.push("TRAP_CAPPED");
  }

  if (
    args.marketMicrostructure?.status === "APPLIED" &&
    args.marketMicrostructure.regime === "STALE_COPY" &&
    args.marketMicrostructure.staleCopyConfidence >= 70
  ) {
    reasonCodes.push("STALE_COPY_CONFIRMED");
  }

  if (args.executionCapacity?.status === "APPLIED") {
    if (args.executionCapacity.label === "SCREEN_VALUE_ONLY") {
      reasonCodes.push("EXECUTION_CAPACITY_SCREEN_ONLY");
    } else if (args.executionCapacity.label === "FRAGILE_STALE") {
      reasonCodes.push("EXECUTION_CAPACITY_FRAGILE");
    }
  }

  const uncertaintyFactor =
    getConfidenceFactor(args.confidenceTier) *
    getBookDepthFactor(args.bookCount) *
    getDisagreementFactor(args.marketDisagreementScore) *
    getSourceFactor(args.sourceQualityScore);
  const efficiencyFactor = getEfficiencyFactor(args.marketEfficiency);
  const decayFactor = getDecayFactor({
    edgeDecay: args.edgeDecay,
    actionState: args.actionState,
    marketMicrostructure: args.marketMicrostructure
  });
  const freshnessFactor = getFreshnessFactor(
    args.providerFreshnessMinutes,
    args.sourceHealthState
  );
  const calibrationFactor = getCalibrationFactor(args.truthCalibrationScoreDelta);
  const microstructureFactor = getMicrostructureFactor(args.marketMicrostructure);
  const destinationFactor = getDestinationFactor(args.closeDestination);
  const executionCapacityFactor = getExecutionCapacityFactor(args.executionCapacity);

  let adjustedKellyFraction = round(
    clamp(
      baseKellyFraction *
        uncertaintyFactor *
        efficiencyFactor *
        decayFactor *
        freshnessFactor *
        calibrationFactor *
        microstructureFactor *
        destinationFactor *
        executionCapacityFactor,
      0,
      bankrollSettings.maxSingleBetPct
    ),
    6
  );

  if (criticalTrap) {
    adjustedKellyFraction = 0;
  }

  const baseStake = round(bankrollSettings.bankroll * baseKellyFraction);
  const adjustedStake = round(bankrollSettings.bankroll * adjustedKellyFraction);
  let recommendedStake = adjustedStake;
  let includeInPortfolio = args.actionState === "BET_NOW" && recommendedStake > 0;

  if (args.actionState === "WAIT") {
    recommendedStake = 0;
    includeInPortfolio = false;
    reasonCodes.push("ACTION_WAIT_NO_ALLOCATION");
  } else if (args.actionState === "WATCH") {
    recommendedStake = 0;
    includeInPortfolio = false;
    reasonCodes.push("ACTION_WATCH_NO_ALLOCATION");
  } else if (args.actionState === "PASS") {
    recommendedStake = 0;
    includeInPortfolio = false;
    reasonCodes.push("ACTION_PASS_NO_ALLOCATION");
  }

  if (
    args.providerFreshnessMinutes === null ||
    args.providerFreshnessMinutes > 20 ||
    args.sourceHealthState === "DEGRADED" ||
    args.sourceHealthState === "FALLBACK"
  ) {
    reasonCodes.push("EXECUTION_RISK_CAP");
  }

  if (recommendedStake > bankrollSettings.availableBankroll) {
    recommendedStake = bankrollSettings.availableBankroll;
    reasonCodes.push("PORTFOLIO_BANKROLL_CAP");
  }

  const bankrollPct =
    bankrollSettings.bankroll > 0
      ? round((recommendedStake / bankrollSettings.bankroll) * 100, 4)
      : 0;
  const recommendation = getRecommendation(bankrollPct);

  if (includeInPortfolio) {
    reasonCodes.push("PORTFOLIO_INCLUDED");
  } else {
    reasonCodes.push("PORTFOLIO_EXCLUDED");
  }

  const capitalPriorityScore = Math.round(
    clamp(
      args.opportunityScore * 0.58 +
        (args.expectedValuePct ?? 0) * 7 +
        adjustedKellyFraction * 1200 +
        args.sourceQualityScore * 0.08 +
        (args.marketMicrostructure?.urgencyScore ?? 0) * 0.12 +
        (args.closeDestination?.scoreDelta ?? 0) * 2 +
        (args.executionCapacity?.rankingDelta ?? 0) * 1.5 -
        args.trapFlags.length * 4,
      0,
      100
    )
  );

  const units =
    bankrollSettings.unitSize > 0
      ? round(recommendedStake / bankrollSettings.unitSize, 2)
      : 0;

  return {
    recommendation,
    units,
    label: getLabel(recommendation),
    rationale: buildRationale({
      recommendation,
      baseKellyFraction,
      adjustedKellyFraction,
      bankrollPct,
      reasonCodes
    }),
    riskFlags: unique(buildRiskFlags(reasonCodes)),
    bankroll: bankrollSettings.bankroll,
    availableBankroll: bankrollSettings.availableBankroll,
    unitSize: bankrollSettings.unitSize,
    bankrollPct,
    baseKellyFraction,
    adjustedKellyFraction,
    baseStake,
    adjustedStake,
    exposureAdjustedStake: recommendedStake,
    competitionAdjustedStake: recommendedStake,
    recommendedStake,
    destinationSizingMultiplier: round(destinationFactor, 4),
    executionCapacityMultiplier: round(executionCapacityFactor, 4),
    exposureAdjustment: 1,
    correlationPenalty: 1,
    competitionPenalty: 1,
    capitalPriorityScore,
    includeInPortfolio,
    riskTolerance: bankrollSettings.riskTolerance,
    sizingConfidence: getSizingConfidence({
      confidenceTier: args.confidenceTier,
      marketDisagreementScore: args.marketDisagreementScore,
      sourceQualityScore: args.sourceQualityScore,
      truthCalibrationScoreDelta: args.truthCalibrationScoreDelta,
      marketMicrostructure: args.marketMicrostructure
    }),
    reasonCodes: unique(reasonCodes),
    exposureDiagnostics: []
  };
}
