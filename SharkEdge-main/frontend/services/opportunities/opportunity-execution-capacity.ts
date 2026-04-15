import type { ProviderHealthState } from "@/lib/types/domain";
import type {
  MarketEfficiencyClass,
  OpportunityBookLeadershipView,
  OpportunityCloseDestinationView,
  OpportunityExecutionCapacityView,
  OpportunityMarketMicrostructureView
} from "@/lib/types/opportunity";

export type OpportunityExecutionCapacityContext = {
  marketType: string;
  marketEfficiency: MarketEfficiencyClass;
  bookCount: number;
  bestPriceFlag: boolean;
  providerFreshnessMinutes: number | null;
  sourceHealthState: ProviderHealthState;
  marketDisagreementScore: number | null;
  sourceQualityScore: number;
  marketMicrostructure: OpportunityMarketMicrostructureView;
  bookLeadership: OpportunityBookLeadershipView;
  closeDestination: OpportunityCloseDestinationView;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getConfidenceBucket(score: number): OpportunityExecutionCapacityView["confidence"] {
  if (score >= 74) {
    return "HIGH";
  }

  if (score >= 52) {
    return "MEDIUM";
  }

  return "LOW";
}

export function buildOpportunityExecutionCapacity(
  context: OpportunityExecutionCapacityContext
): OpportunityExecutionCapacityView {
  const fragmented =
    context.marketEfficiency === "FRAGMENTED_PROP" ||
    context.marketEfficiency === "THIN_SPECIALTY";
  const sourceHealthPenalty =
    context.sourceHealthState === "OFFLINE"
      ? 28
      : context.sourceHealthState === "DEGRADED"
        ? 12
        : 0;
  const freshnessPenalty =
    context.providerFreshnessMinutes === null
      ? 6
      : context.providerFreshnessMinutes <= 4
        ? 0
        : context.providerFreshnessMinutes <= 10
          ? 4
          : context.providerFreshnessMinutes <= 20
            ? 10
            : 18;
  const disagreementPenalty = clamp((context.marketDisagreementScore ?? 0) * 110, 0, 18);
  const bestPriceBonus = context.bestPriceFlag ? 8 : -6;
  const pathBonus =
    (context.marketMicrostructure.pathTrusted ? 10 : -4) +
    context.marketMicrostructure.urgencyScore * 0.12 +
    context.marketMicrostructure.scoreDelta * 1.1;
  const leadershipBonus = context.bookLeadership.status === "APPLIED"
    ? context.bookLeadership.pathConfidenceAdjustment * 60
    : 0;
  const destinationBonus =
    context.closeDestination.status === "APPLIED"
      ? context.closeDestination.label === "DECAY"
        ? 8
        : context.closeDestination.label === "IMPROVE"
          ? -8
          : context.closeDestination.label === "MOSTLY_PRICED"
            ? -12
            : 0
      : 0;
  const depthBonus = context.bookCount >= 6 ? 12 : context.bookCount >= 4 ? 6 : context.bookCount >= 3 ? 1 : -8;
  const efficiencyPenalty =
    context.marketEfficiency === "HIGH_EFFICIENCY"
      ? 0
      : context.marketEfficiency === "MID_EFFICIENCY"
        ? 3
        : fragmented
          ? 14
          : 8;

  const rawScore = Math.round(
    clamp(
      42 +
        bestPriceBonus +
        depthBonus +
        pathBonus +
        leadershipBonus +
        destinationBonus +
        context.sourceQualityScore * 0.12 -
        freshnessPenalty -
        sourceHealthPenalty -
        disagreementPenalty -
        efficiencyPenalty,
      0,
      100
    )
  );

  const fragileStale =
    context.marketMicrostructure.regime === "STALE_COPY" &&
    context.marketMicrostructure.staleCopyConfidence >= 68 &&
    (context.bookCount <= 3 || fragmented);
  const screenOnly =
    rawScore < 42 ||
    context.sourceHealthState === "OFFLINE" ||
    (context.marketMicrostructure.status !== "APPLIED" && context.bookCount <= 2);

  const label = screenOnly
    ? "SCREEN_VALUE_ONLY"
    : fragileStale
      ? "FRAGILE_STALE"
      : rawScore >= 74
        ? "FULLY_ACTIONABLE"
        : "MODERATELY_ACTIONABLE";

  const confidence = getConfidenceBucket(
    rawScore +
      (context.marketMicrostructure.historyQualified ? 8 : 0) +
      (context.bookLeadership.status === "APPLIED" ? 6 : 0)
  );

  const stakeMultiplier =
    label === "FULLY_ACTIONABLE"
      ? 1
      : label === "MODERATELY_ACTIONABLE"
        ? 0.82
        : label === "FRAGILE_STALE"
          ? 0.58
          : 0.28;
  const rankingDelta =
    label === "FULLY_ACTIONABLE"
      ? 4
      : label === "MODERATELY_ACTIONABLE"
        ? 0
        : label === "FRAGILE_STALE"
          ? -2
          : -8;
  const timingDelta =
    label === "FULLY_ACTIONABLE"
      ? 2
      : label === "MODERATELY_ACTIONABLE"
        ? 0
        : label === "FRAGILE_STALE"
          ? 1
          : -4;

  const reasonCodes = [
    label === "SCREEN_VALUE_ONLY"
      ? "CAPACITY_SCREEN_ONLY"
      : label === "FRAGILE_STALE"
        ? "CAPACITY_FRAGILE_STALE"
        : label === "FULLY_ACTIONABLE"
          ? "CAPACITY_ACTIONABLE"
          : "CAPACITY_MODERATE",
    context.bestPriceFlag ? "CAPACITY_BEST_PRICE" : "CAPACITY_NOT_BEST_PRICE"
  ];

  const notes = [
    label === "FULLY_ACTIONABLE"
      ? "Displayed edge looks deployable at real size, not just screen value."
      : label === "MODERATELY_ACTIONABLE"
        ? "Edge looks playable but still needs size discipline."
        : label === "FRAGILE_STALE"
          ? "Edge looks real but fragile, so it should be hit smaller than the score alone suggests."
          : "Displayed edge looks more like screen value than scalable execution capacity.",
    fragmented
      ? "Market fragmentation keeps execution capacity capped even when the edge is real."
      : `${context.bookCount} books in the lane gives the engine a better read on how scalable the price really is.`,
    context.sourceHealthState === "HEALTHY"
      ? "Provider health is strong enough that capacity is not being cut for feed risk."
      : "Provider health is cutting execution capacity because stale or degraded feeds create fake size."
  ];

  return {
    status: "APPLIED",
    label,
    confidence,
    capacityScore: rawScore,
    stakeMultiplier,
    rankingDelta,
    timingDelta,
    reasonCodes,
    notes
  };
}

export function buildOpportunityExecutionCapacitySummary(view: OpportunityExecutionCapacityView) {
  return `Execution capacity ${view.label.toLowerCase().replace(/_/g, " ")} with ${view.capacityScore} capacity score.`;
}
