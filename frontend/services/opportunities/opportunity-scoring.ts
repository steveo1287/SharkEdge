import type {
  OpportunityScoreComponents,
  OpportunityTrapFlag
} from "@/lib/types/opportunity";

type BuildOpportunityScoreArgs = {
  expectedValuePct: number | null;
  fairLineGap: number | null;
  edgeScore: number;
  confidenceScore: number;
  qualityScore: number;
  disagreementScore: number | null;
  freshnessMinutes: number | null;
  bookCount: number;
  timingQuality: number;
  supportScore: number;
  trapFlags: OpportunityTrapFlag[];
  personalizationDelta: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

function trapPenalty(flag: OpportunityTrapFlag) {
  switch (flag) {
    case "STALE_EDGE":
      return 24;
    case "LOW_PROVIDER_HEALTH":
      return 22;
    case "ONE_BOOK_OUTLIER":
      return 18;
    case "THIN_MARKET":
      return 16;
    case "FAKE_MOVE_RISK":
      return 14;
    case "HIGH_MARKET_DISAGREEMENT":
      return 12;
    case "LOW_CONFIDENCE_FAIR_PRICE":
      return 10;
    case "MODEL_MARKET_CONFLICT":
      return 9;
    case "INJURY_UNCERTAINTY":
      return 8;
    default:
      return 6;
  }
}

function buildPriceEdgeScore(args: BuildOpportunityScoreArgs) {
  const fairGapScore = clamp((args.fairLineGap ?? 0) * 0.42, 0, 14);
  const edgeScoreBoost = clamp((args.edgeScore - 50) * 0.16, 0, 12);

  return clamp(fairGapScore + edgeScoreBoost, 0, 26);
}

function buildExpectedValueScore(args: BuildOpportunityScoreArgs) {
  const ev = args.expectedValuePct ?? 0;

  if (ev <= 0) {
    return 0;
  }

  if (ev >= 4) {
    return 24;
  }

  if (ev >= 3) {
    return 20;
  }

  if (ev >= 2) {
    return 15;
  }

  if (ev >= 1) {
    return 9;
  }

  return 4;
}

function buildMarketValidationScore(args: BuildOpportunityScoreArgs) {
  const qualityComponent = clamp(args.qualityScore * 0.18, 0, 8);
  const bookComponent =
    args.bookCount >= 6
      ? 10
      : args.bookCount >= 4
        ? 8
        : args.bookCount >= 3
          ? 6
          : args.bookCount >= 2
            ? 3
            : 0;

  const disagreementPenalty =
    typeof args.disagreementScore === "number"
      ? clamp(args.disagreementScore * 22, 0, 10)
      : 0;

  return clamp(qualityComponent + bookComponent - disagreementPenalty, 0, 18);
}

function buildFreshnessScore(args: BuildOpportunityScoreArgs) {
  if (args.freshnessMinutes === null) {
    return 6;
  }

  if (args.freshnessMinutes <= 3) {
    return 16;
  }

  if (args.freshnessMinutes <= 8) {
    return 14;
  }

  if (args.freshnessMinutes <= 15) {
    return 11;
  }

  if (args.freshnessMinutes <= 30) {
    return 7;
  }

  if (args.freshnessMinutes <= 60) {
    return 3;
  }

  return 0;
}

function buildTimingScore(args: BuildOpportunityScoreArgs) {
  return clamp(args.timingQuality * 0.16, 0, 16);
}

function buildSupportScore(args: BuildOpportunityScoreArgs) {
  const baseSupport = clamp(args.supportScore, 0, 10);
  const confidenceSupport = clamp(args.confidenceScore * 0.05, 0, 4);

  return clamp(baseSupport + confidenceSupport, 0, 14);
}

function buildEfficiencyPenalty(args: BuildOpportunityScoreArgs) {
  const disagreement = args.disagreementScore ?? 0;

  if (
    args.bookCount >= 5 &&
    disagreement <= 0.04 &&
    (args.expectedValuePct ?? 0) < 1.25 &&
    (args.fairLineGap ?? 0) < 6
  ) {
    return 12;
  }

  if (
    args.bookCount >= 4 &&
    disagreement <= 0.06 &&
    (args.expectedValuePct ?? 0) < 1.75
  ) {
    return 7;
  }

  return 0;
}

function buildDecayPenalty(args: BuildOpportunityScoreArgs) {
  if (args.freshnessMinutes === null) {
    return 2;
  }

  if (args.freshnessMinutes <= 8) {
    return 0;
  }

  if (args.freshnessMinutes <= 15) {
    return 2;
  }

  if (args.freshnessMinutes <= 30) {
    return 5;
  }

  if (args.freshnessMinutes <= 60) {
    return 9;
  }

  return 14;
}

export function buildOpportunityScore(
  args: BuildOpportunityScoreArgs
): {
  score: number;
  components: OpportunityScoreComponents;
} {
  const priceEdge = buildPriceEdgeScore(args);
  const expectedValue = buildExpectedValueScore(args);
  const marketValidation = buildMarketValidationScore(args);
  const freshness = buildFreshnessScore(args);
  const timingQuality = buildTimingScore(args);
  const support = buildSupportScore(args);
  const personalization = clamp(args.personalizationDelta, -8, 8);

  const trapPenalties = args.trapFlags.reduce(
    (total, flag) => total + trapPenalty(flag),
    0
  );
  const efficiencyPenalty = buildEfficiencyPenalty(args);
  const decayPenalty = buildDecayPenalty(args);
  const penalties = trapPenalties + efficiencyPenalty + decayPenalty;

  const baseScore = 10;
  const rawScore =
    baseScore +
    priceEdge +
    expectedValue +
    marketValidation +
    freshness +
    timingQuality +
    support +
    personalization -
    penalties;

  const score = clamp(round(rawScore), 0, 100);

  return {
    score,
    components: {
      priceEdge: round(priceEdge),
      expectedValue: round(expectedValue),
      marketValidation: round(marketValidation),
      timingQuality: round(timingQuality),
      freshness: round(freshness),
      support: round(support),
      personalization,
      penalties
    }
  };
}