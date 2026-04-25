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
  sourceQualityScore?: number;
  marketEfficiencyScore?: number;
  edgeDecayPenalty?: number;
  simVerdictScore?: number;
  trendVerdictScore?: number;
  truthCalibrationScoreDelta?: number;
  reasonCalibrationScoreDelta?: number;
  marketPathScoreDelta?: number;
  closeDestinationScoreDelta?: number;
  executionCapacityScoreDelta?: number;
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

function buildSourceQualityScore(args: BuildOpportunityScoreArgs) {
  return clamp((args.sourceQualityScore ?? 50) * 0.12, 0, 12);
}

function buildMarketEfficiencyScore(args: BuildOpportunityScoreArgs) {
  return clamp(args.marketEfficiencyScore ?? 0, -8, 8);
}

function buildSimulationScore(args: BuildOpportunityScoreArgs) {
  const simScore = args.simVerdictScore ?? 0;
  if (simScore <= 20) {
    return -3;
  }
  if (simScore <= 40) {
    return -1;
  }
  if (simScore <= 60) {
    return 0;
  }
  if (simScore <= 75) {
    return 4;
  }
  return 8;
}

function buildTrendScore(args: BuildOpportunityScoreArgs) {
  const trendScore = args.trendVerdictScore ?? 0;
  if (trendScore <= 25) {
    return -2;
  }
  if (trendScore <= 45) {
    return 0;
  }
  if (trendScore <= 65) {
    return 2;
  }
  if (trendScore <= 80) {
    return 4;
  }
  return 6;
}

function buildDecayPenalty(args: BuildOpportunityScoreArgs) {
  return clamp((args.edgeDecayPenalty ?? 0) * 0.55, 0, 24);
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
  const sourceQuality = buildSourceQualityScore(args);
  const marketEfficiency = buildMarketEfficiencyScore(args);
  const simulation = buildSimulationScore(args);
  const trends = buildTrendScore(args);
  const edgeDecayPenalty = buildDecayPenalty(args);
  const truthCalibration = clamp(args.truthCalibrationScoreDelta ?? 0, -8, 6);
  const reasonCalibration = clamp(args.reasonCalibrationScoreDelta ?? 0, -5, 5);
  const marketPath = clamp(args.marketPathScoreDelta ?? 0, -6, 6);
  const closeDestination = clamp(args.closeDestinationScoreDelta ?? 0, -6, 5);
  const executionCapacity = clamp(args.executionCapacityScoreDelta ?? 0, -6, 4);
  const personalization = clamp(args.personalizationDelta, -8, 8);

  const trapPenalties = args.trapFlags.reduce(
    (total, flag) => total + trapPenalty(flag),
    0
  );
  const penalties = trapPenalties + edgeDecayPenalty;

  const baseScore = 10;
  const rawScore =
    baseScore +
    priceEdge +
    expectedValue +
    marketValidation +
    freshness +
    timingQuality +
    support +
    sourceQuality +
    marketEfficiency +
    simulation +
    trends +
    truthCalibration +
    reasonCalibration +
    marketPath +
    closeDestination +
    executionCapacity +
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
      sourceQuality: round(sourceQuality),
      marketEfficiency: round(marketEfficiency),
      simulation: round(simulation),
      trends: round(trends),
      edgeDecay: -round(edgeDecayPenalty),
      truthCalibration: round(truthCalibration),
      reasonCalibration: round(reasonCalibration),
      marketPath: round(marketPath),
      closeDestination: round(closeDestination),
      executionCapacity: round(executionCapacity),
      personalization,
      penalties
    }
  };
}
