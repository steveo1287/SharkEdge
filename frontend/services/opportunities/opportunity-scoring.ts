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
      return 22;
    case "LOW_PROVIDER_HEALTH":
      return 20;
    case "THIN_MARKET":
      return 16;
    case "ONE_BOOK_OUTLIER":
      return 16;
    case "HIGH_MARKET_DISAGREEMENT":
      return 12;
    case "LOW_CONFIDENCE_FAIR_PRICE":
      return 10;
    case "FAKE_MOVE_RISK":
      return 10;
    case "MODEL_MARKET_CONFLICT":
      return 8;
    case "INJURY_UNCERTAINTY":
      return 8;
    default:
      return 6;
  }
}

function buildPriceEdgeScore(args: BuildOpportunityScoreArgs) {
  const fairGapScore = clamp((args.fairLineGap ?? 0) * 0.42, 0, 12);
  const edgeScoreBoost = clamp((args.edgeScore - 50) * 0.14, 0, 12);

  return clamp(fairGapScore + edgeScoreBoost, 0, 24);
}

function buildExpectedValueScore(args: BuildOpportunityScoreArgs) {
  return clamp((args.expectedValuePct ?? 0) * 2.1, 0, 24);
}

function buildMarketValidationScore(args: BuildOpportunityScoreArgs) {
  const qualityComponent = clamp(args.qualityScore * 0.2, 0, 8);
  const bookComponent = clamp(args.bookCount * 2.25, 0, 8);
  const disagreementPenalty = clamp((args.disagreementScore ?? 0) * 18, 0, 8);

  return clamp(qualityComponent + bookComponent - disagreementPenalty, 0, 18);
}

function buildFreshnessScore(args: BuildOpportunityScoreArgs) {
  if (args.freshnessMinutes === null) {
    return 7;
  }

  if (args.freshnessMinutes <= 5) {
    return 16;
  }

  if (args.freshnessMinutes <= 15) {
    return 13;
  }

  if (args.freshnessMinutes <= 30) {
    return 10;
  }

  if (args.freshnessMinutes <= 60) {
    return 6;
  }

  return 2;
}

function buildTimingScore(args: BuildOpportunityScoreArgs) {
  return clamp(args.timingQuality * 0.16, 0, 14);
}

function buildSupportScore(args: BuildOpportunityScoreArgs) {
  const baseSupport = clamp(args.supportScore, 0, 10);
  const confidenceSupport = clamp(args.confidenceScore * 0.05, 0, 4);

  return clamp(baseSupport + confidenceSupport, 0, 14);
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
  const penalties = args.trapFlags.reduce(
    (total, flag) => total + trapPenalty(flag),
    0
  );

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