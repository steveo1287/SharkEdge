import type {
  MarketEfficiencyClass,
  OpportunityConfidenceTier,
  OpportunityEdgeDecayView,
  OpportunityTrapFlag,
  PositionSizeRecommendation,
  PositionSizingGuidance
} from "@/lib/types/opportunity";

function hasAnyTrap(
  trapFlags: OpportunityTrapFlag[],
  candidates: OpportunityTrapFlag[]
) {
  return candidates.some((flag) => trapFlags.includes(flag));
}

function getUnits(recommendation: PositionSizeRecommendation) {
  switch (recommendation) {
    case "AGGRESSIVE":
      return 1.25;
    case "STANDARD":
      return 1;
    case "SMALL":
      return 0.5;
    case "MICRO":
      return 0.15;
    case "NO_BET":
      return 0;
  }
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

function tierAdjustment(confidenceTier: OpportunityConfidenceTier) {
  switch (confidenceTier) {
    case "A":
      return 10;
    case "B":
      return 3;
    case "C":
      return -10;
    case "D":
      return -24;
  }
}

function efficiencyAdjustment(efficiency: MarketEfficiencyClass) {
  switch (efficiency) {
    case "HIGH_EFFICIENCY":
      return 3;
    case "MID_EFFICIENCY":
      return 0;
    case "LOW_EFFICIENCY":
      return -8;
    case "FRAGMENTED_PROP":
      return -12;
    case "THIN_SPECIALTY":
      return -18;
  }
}

export function buildPositionSizingGuidance(args: {
  opportunityScore: number;
  confidenceTier: OpportunityConfidenceTier;
  trapFlags: OpportunityTrapFlag[];
  bookCount: number;
  providerFreshnessMinutes: number | null;
  marketDisagreementScore: number | null;
  marketEfficiency: MarketEfficiencyClass;
  bestPriceFlag: boolean;
  edgeDecay: OpportunityEdgeDecayView;
}): PositionSizingGuidance {
  const riskFlags: string[] = [];
  let sizingScore =
    args.opportunityScore +
    tierAdjustment(args.confidenceTier) +
    efficiencyAdjustment(args.marketEfficiency) -
    Math.round(args.edgeDecay.penalty * 0.9);

  if (!args.bestPriceFlag) {
    sizingScore -= 16;
    riskFlags.push("Best price is not confirmed.");
  }

  if (args.bookCount < 3) {
    sizingScore -= 14;
    riskFlags.push("Market depth is thin.");
  }

  if ((args.marketDisagreementScore ?? 0) >= 0.16) {
    sizingScore -= 12;
    riskFlags.push("Books are materially split.");
  }

  if (
    args.providerFreshnessMinutes !== null &&
    args.providerFreshnessMinutes > 20
  ) {
    sizingScore -= 10;
    riskFlags.push("Provider freshness is aging.");
  }

  if (
    hasAnyTrap(args.trapFlags, [
      "STALE_EDGE",
      "LOW_PROVIDER_HEALTH",
      "ONE_BOOK_OUTLIER",
      "MODEL_MARKET_CONFLICT"
    ])
  ) {
    return {
      recommendation: "NO_BET",
      units: 0,
      label: "No bet",
      rationale: "Critical trap flag is active, so sizing is blocked.",
      riskFlags: Array.from(new Set([...riskFlags, ...args.trapFlags]))
    };
  }

  let recommendation: PositionSizeRecommendation = "NO_BET";
  if (sizingScore >= 94) {
    recommendation = "AGGRESSIVE";
  } else if (sizingScore >= 82) {
    recommendation = "STANDARD";
  } else if (sizingScore >= 68) {
    recommendation = "SMALL";
  } else if (sizingScore >= 52) {
    recommendation = "MICRO";
  }

  if (recommendation !== "NO_BET" && args.trapFlags.length >= 2) {
    recommendation = recommendation === "AGGRESSIVE" ? "STANDARD" : "SMALL";
    riskFlags.push("Multiple caution flags cap the position.");
  }

  return {
    recommendation,
    units: getUnits(recommendation),
    label: getLabel(recommendation),
    rationale:
      recommendation === "NO_BET"
        ? "Edge does not clear the sizing gate after market-quality adjustments."
        : `${getLabel(recommendation)} sizing after score, source quality, decay, and trap checks.`,
    riskFlags: Array.from(new Set(riskFlags))
  };
}
