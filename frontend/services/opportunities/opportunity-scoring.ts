import type { OpportunityScoreComponents, OpportunityTrapFlag } from "@/lib/types/opportunity";

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

function trapPenalty(flag: OpportunityTrapFlag) {
  switch (flag) {
    case "STALE_EDGE":
      return 18;
    case "LOW_PROVIDER_HEALTH":
      return 16;
    case "THIN_MARKET":
      return 14;
    case "ONE_BOOK_OUTLIER":
      return 16;
    case "HIGH_MARKET_DISAGREEMENT":
      return 12;
    case "LOW_CONFIDENCE_FAIR_PRICE":
      return 10;
    case "FAKE_MOVE_RISK":
      return 8;
    case "MODEL_MARKET_CONFLICT":
      return 8;
    default:
      return 6;
  }
}

export function buildOpportunityScore(
  args: BuildOpportunityScoreArgs
): {
  score: number;
  components: OpportunityScoreComponents;
} {
  const priceEdge = clamp((args.fairLineGap ?? 0) * 0.45 + (args.edgeScore - 50) * 0.12, 0, 24);
  const expectedValue = clamp((args.expectedValuePct ?? 0) * 2.4, 0, 24);
  const marketValidation = clamp(
    args.qualityScore * 0.22 +
      Math.min(10, args.bookCount * 2.5) -
      Math.min(10, (args.disagreementScore ?? 0) * 22),
    0,
    18
  );
  const freshness = clamp(
    args.freshnessMinutes === null ? 7 : 16 - args.freshnessMinutes * 0.5,
    0,
    16
  );
  const timingQuality = clamp(args.timingQuality * 0.16, 0, 14);
  const support = clamp(args.supportScore + args.confidenceScore * 0.05, 0, 14);
  const personalization = clamp(args.personalizationDelta, -8, 8);
  const penalties = args.trapFlags.reduce((total, flag) => total + trapPenalty(flag), 0);

  const score = clamp(
    Math.round(
      12 +
        priceEdge +
        expectedValue +
        marketValidation +
        freshness +
        timingQuality +
        support +
        personalization -
        penalties
    ),
    0,
    100
  );

  return {
    score,
    components: {
      priceEdge: Math.round(priceEdge),
      expectedValue: Math.round(expectedValue),
      marketValidation: Math.round(marketValidation),
      timingQuality: Math.round(timingQuality),
      freshness: Math.round(freshness),
      support: Math.round(support),
      personalization,
      penalties
    }
  };
}
