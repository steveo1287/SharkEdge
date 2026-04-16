import type {
  OpportunityActionState,
  OpportunityRankingView,
  OpportunityView
} from "@/lib/types/opportunity";

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

function buildRankingNotes(args: {
  capitalEfficiencyScore: number;
  edgeQualityScore: number;
  destinationQualityScore: number;
  executionQualityScore: number;
  executionCapacityScore: number;
  marketPathQualityScore: number;
  portfolioFitScore: number;
  actionModifier: number;
}) {
  const capitalLeader = args.capitalEfficiencyScore >= args.edgeQualityScore;
  const notes = [
    capitalLeader
      ? `Rank leans on capital efficiency ${args.capitalEfficiencyScore} over posture.`
      : `Rank leans on edge quality ${args.edgeQualityScore} with capital efficiency ${args.capitalEfficiencyScore}.`,
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

  const compositeScore = round(
    clamp(
      capitalEfficiencyScore * 0.26 +
        edgeQualityScore * 0.22 +
        destinationQualityScore * 0.14 +
        executionQualityScore * 0.1 +
        executionCapacityScore * 0.12 +
        marketPathQualityScore * 0.09 +
        portfolioFitScore * 0.07 +
        actionModifier,
      0,
      100
    )
  );

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
    notes: buildRankingNotes({
      capitalEfficiencyScore,
      edgeQualityScore,
      destinationQualityScore,
      executionQualityScore,
      executionCapacityScore,
      marketPathQualityScore,
      portfolioFitScore,
      actionModifier
    })
  };
}
