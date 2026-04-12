import type {
  OpportunityActionState,
  OpportunityRankingView,
  OpportunityView
} from "@/lib/types/opportunity"
import { decideOpportunity } from "@/services/opportunities/opportunity-decision-policy"
import { assessBookContext } from "@/services/market-intelligence/book-context"
import { assessDistributionPricing } from "@/services/pricing/distribution-pricing";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

function getActionModifier(actionState: OpportunityActionState) {
  switch (actionState) {
    case "BET_NOW":
      return 4;
    case "WAIT":
      return 2;
    case "WATCH":
      return 0;
    case "PASS":
    default:
      return -6;
  }
}

function getExecutionQualityScore(opportunity: OpportunityView) {
  if (opportunity.executionContext?.status === "HISTORICAL") {
    return clamp(opportunity.executionContext.executionScore ?? 55, 0, 100);
  }

  const neutral =
    52 +
    (opportunity.marketMicrostructure.status === "APPLIED"
      ? opportunity.marketMicrostructure.urgencyScore * 0.18
      : 0) +
    (opportunity.actionState === "BET_NOW" ? 4 : 0);

  return round(clamp(neutral, 0, 100));
}

function getMarketPathQualityScore(opportunity: OpportunityView) {
  if (opportunity.marketMicrostructure.status !== "APPLIED") {
    return round(clamp(42 + opportunity.sourceQuality.score * 0.14, 0, 100));
  }

  const score =
    42 +
    opportunity.marketMicrostructure.urgencyScore * 0.28 +
    opportunity.marketMicrostructure.scoreDelta * 5 +
    opportunity.bookLeadership.pathConfidenceAdjustment * 90 +
    (opportunity.marketMicrostructure.pathTrusted ? 10 : -6) +
    (opportunity.marketMicrostructure.historyQualified ? 5 : 0) -
    (opportunity.marketMicrostructure.trapEscalation ? 8 : 0);

  return round(clamp(score, 0, 100));
}

function getPortfolioFitScore(opportunity: OpportunityView) {
  const exposureBurden = (1 - (opportunity.sizing.exposureAdjustment ?? 1)) * 28;
  const correlationBurden = (1 - (opportunity.sizing.correlationPenalty ?? 1)) * 24;
  const competitionBurden = (1 - (opportunity.sizing.competitionPenalty ?? 1)) * 20;
  const trapBurden = opportunity.trapFlags.length * 4;
  const zeroStakeBurden = opportunity.sizing.recommendedStake <= 0 ? 16 : 0;

  return round(
    clamp(
      100 - exposureBurden - correlationBurden - competitionBurden - trapBurden - zeroStakeBurden,
      0,
      100
    )
  );
}

function getDestinationQualityScore(opportunity: OpportunityView) {
  const destination = opportunity.closeDestination;
  const score =
    48 +
    destination.confidenceScore * 0.34 +
    destination.scoreDelta * 5 +
    (destination.label === "DECAY"
      ? 8
      : destination.label === "HOLD"
        ? 2
        : destination.label === "IMPROVE"
          ? -4
          : -10);

  return round(clamp(score, 0, 100));
}

function getExecutionCapacityScore(opportunity: OpportunityView) {
  const capacity = opportunity.executionCapacity;
  const score =
    capacity.capacityScore +
    capacity.rankingDelta * 4 +
    (capacity.label === "FULLY_ACTIONABLE"
      ? 8
      : capacity.label === "MODERATELY_ACTIONABLE"
        ? 2
        : capacity.label === "FRAGILE_STALE"
          ? -4
          : -12);

  return round(clamp(score, 0, 100));
}

function getCapitalEfficiencyScore(opportunity: OpportunityView) {
  const recommendedStakeScore = Math.min(opportunity.sizing.bankrollPct * 22, 18);
  const certaintyBonus = opportunity.sizing.sizingConfidence === "HIGH"
    ? 8
    : opportunity.sizing.sizingConfidence === "MEDIUM"
      ? 4
      : 0;

  const score =
    (opportunity.sizing.capitalPriorityScore ?? 0) * 0.72 +
    recommendedStakeScore +
    certaintyBonus -
    (opportunity.sizing.reasonCodes.includes("BETTER_CAPITAL_USE_EXISTS") ? 8 : 0) -
    (opportunity.sizing.reasonCodes.includes("CORRELATED_WITH_OPEN_EXPOSURE") ? 6 : 0);

  return round(clamp(score, 0, 100));
}

function getEdgeQualityScore(opportunity: OpportunityView) {
  const score =
    opportunity.opportunityScore * 0.76 +
    (opportunity.expectedValuePct ?? 0) * 4 +
    opportunity.sourceQuality.score * 0.08 +
    opportunity.truthCalibration.scoreDelta * 1.8 +
    opportunity.marketMicrostructure.scoreDelta * 1.5 -
    opportunity.trapFlags.length * 3;

  return round(clamp(score, 0, 100));
}

function getExpectedClvScore(opportunity: OpportunityView) {
  const destinationBias =
    opportunity.closeDestination.label === "DECAY"
      ? 14
      : opportunity.closeDestination.label === "HOLD"
        ? 5
        : opportunity.closeDestination.label === "IMPROVE"
          ? -10
          : -4;

  const microstructureBias =
    opportunity.marketMicrostructure.status === "APPLIED"
      ? opportunity.marketMicrostructure.repricingLikelihood * 0.42 +
        opportunity.marketMicrostructure.urgencyScore * 0.24 +
        (opportunity.marketMicrostructure.regime === "STALE_COPY" ? 10 : 0)
      : 0;

  const score =
    34 +
    microstructureBias +
    destinationBias +
    opportunity.truthCalibration.timingDelta * 2.2 +
    opportunity.reasonCalibration.timingDelta * 1.7 +
    (opportunity.timingReplay.status === "APPLIED"
      ? opportunity.timingReplay.timingDelta * 1.8
      : 0) -
    opportunity.trapFlags.length * 3;

  return round(clamp(score, 0, 100));
}

function getFragilityScore(opportunity: OpportunityView) {
  const freshnessPenalty =
    typeof opportunity.providerFreshnessMinutes === "number"
      ? Math.min(opportunity.providerFreshnessMinutes, 60) * 0.55
      : 18;
  const disagreementPenalty = (opportunity.marketDisagreementScore ?? 0) * 95;
  const trapPenalty = opportunity.trapFlags.length * 11;
  const sourcePenalty = (100 - opportunity.sourceQuality.score) * 0.34;
  const efficiencyPenalty =
    opportunity.marketEfficiency === "THIN_SPECIALTY"
      ? 16
      : opportunity.marketEfficiency === "FRAGMENTED_PROP"
        ? 11
        : opportunity.marketEfficiency === "LOW_EFFICIENCY"
          ? 7
          : 0;
  const score = freshnessPenalty + disagreementPenalty + trapPenalty + sourcePenalty + efficiencyPenalty;
  return round(clamp(score, 0, 100));
}

function getTrendReliabilityScore(opportunity: OpportunityView) {
  const calibrationLift =
    (opportunity.truthCalibration.status === "APPLIED" ? 8 : 0) +
    (opportunity.reasonCalibration.status === "APPLIED" ? 10 : 0) +
    (opportunity.timingReplay.status === "APPLIED" ? 8 : 0);
  const trapPenalty = opportunity.trapFlags.includes("LOW_CONFIDENCE_FAIR_PRICE") ? 14 : 0;
  const disagreementPenalty = (opportunity.marketDisagreementScore ?? 0) * 70;

  const score =
    opportunity.sourceQuality.score * 0.52 +
    opportunity.opportunityScore * 0.18 +
    calibrationLift -
    disagreementPenalty -
    trapPenalty;

  return round(clamp(score, 0, 100));
}

function getRecommendationTier(args: {
  compositeScore: number;
  fragilityScore: number;
  expectedClvScore: number;
  actionState: OpportunityActionState;
}) {
  if (args.actionState === "PASS" || args.compositeScore < 45) {
    return "PASS" as const;
  }

  if (args.actionState === "WATCH" || args.fragilityScore >= 68) {
    return "WATCH" as const;
  }

  if (args.actionState === "BET_NOW" && args.compositeScore >= 78 && args.expectedClvScore >= 62) {
    return "PRIME" as const;
  }

  return "ACTIONABLE" as const;
}

function buildRankingNotes(args: {
  capitalEfficiencyScore: number;
  edgeQualityScore: number;
  destinationQualityScore: number;
  executionQualityScore: number;
  executionCapacityScore: number;
  marketPathQualityScore: number;
  portfolioFitScore: number;
  actionModifier: number;
  expectedClvScore: number;
  fragilityScore: number;
  trendReliabilityScore: number;
  recommendationTier: "PRIME" | "ACTIONABLE" | "WATCH" | "PASS";
}) {
  const capitalLeader = args.capitalEfficiencyScore >= args.edgeQualityScore;
  const notes = [
    capitalLeader
      ? `Rank leans on capital efficiency ${args.capitalEfficiencyScore} over posture.`
      : `Rank leans on edge quality ${args.edgeQualityScore} with capital efficiency ${args.capitalEfficiencyScore}.`,
    `Expected CLV quality is ${args.expectedClvScore} while fragility prints ${args.fragilityScore}.`,
    `Trend reliability contributes ${args.trendReliabilityScore}; recommendation tier is ${args.recommendationTier.toLowerCase()}.`,
    `Destination quality contributes ${args.destinationQualityScore}, execution capacity ${args.executionCapacityScore}, and execution quality ${args.executionQualityScore}.`,
    `Market-path quality contributes ${args.marketPathQualityScore} and portfolio fit sits at ${args.portfolioFitScore}.`,
    `Portfolio fit is ${args.portfolioFitScore} and posture only adds ${args.actionModifier >= 0 ? "+" : ""}${args.actionModifier}.`
  ];

  return notes;
}

export function buildOpportunityRanking(opportunity: OpportunityView): OpportunityRankingView {
  const capitalEfficiencyScore = getCapitalEfficiencyScore(opportunity);
  const edgeQualityScore = getEdgeQualityScore(opportunity);
  const destinationQualityScore = getDestinationQualityScore(opportunity);
  const executionQualityScore = getExecutionQualityScore(opportunity);
  const executionCapacityScore = getExecutionCapacityScore(opportunity);
  const marketPathQualityScore = getMarketPathQualityScore(opportunity);
  const portfolioFitScore = getPortfolioFitScore(opportunity);
  const actionModifier = getActionModifier(opportunity.actionState);

  const expectedClvScore = getExpectedClvScore(opportunity);
  const fragilityScore = getFragilityScore(opportunity);
  const trendReliabilityScore = getTrendReliabilityScore(opportunity);

  const compositeScore = round(
    clamp(
      capitalEfficiencyScore * 0.22 +
        edgeQualityScore * 0.2 +
        destinationQualityScore * 0.11 +
        executionQualityScore * 0.08 +
        executionCapacityScore * 0.1 +
        marketPathQualityScore * 0.1 +
        portfolioFitScore * 0.07 +
        expectedClvScore * 0.16 +
        trendReliabilityScore * 0.08 -
        fragilityScore * 0.12 +
        actionModifier,
      0,
      100
    )
  );

  const recommendationTier = getRecommendationTier({
    compositeScore,
    fragilityScore,
    expectedClvScore,
    actionState: opportunity.actionState
  });

  return {
    compositeScore,
    capitalEfficiencyScore,
    edgeQualityScore,
    destinationQualityScore,
    executionQualityScore,
    executionCapacityScore,
    marketPathQualityScore,
    portfolioFitScore,
    actionModifier,
    expectedClvScore,
    fragilityScore,
    trendReliabilityScore,
    recommendationTier,
    notes: buildRankingNotes({
      capitalEfficiencyScore,
      edgeQualityScore,
      destinationQualityScore,
      executionQualityScore,
      executionCapacityScore,
      marketPathQualityScore,
      portfolioFitScore,
      actionModifier,
      expectedClvScore,
      fragilityScore,
      trendReliabilityScore,
      recommendationTier
    })
  };
}
