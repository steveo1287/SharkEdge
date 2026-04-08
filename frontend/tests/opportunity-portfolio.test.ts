import type {
  OpportunityBankrollSettings,
  OpportunityView
} from "@/lib/types/opportunity";
import { buildDefaultBankrollSettings } from "@/services/account/user-service";
import { buildExecutionQualityAssessment } from "@/services/opportunities/opportunity-execution";
import { createOpportunityPortfolioAllocator } from "@/services/opportunities/opportunity-portfolio";
import { buildPositionSizingGuidance } from "@/services/opportunities/opportunity-sizing";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeBankrollSettings(
  overrides: Partial<OpportunityBankrollSettings> = {}
): OpportunityBankrollSettings {
  return {
    ...buildDefaultBankrollSettings(),
    bankroll: 10_000,
    availableBankroll: 10_000,
    unitSize: 100,
    baseKellyFraction: 0.25,
    maxSingleBetPct: 0.0225,
    maxOpenExposurePct: 0.12,
    maxEventExposurePct: 0.04,
    maxMarketExposurePct: 0.03,
    ...overrides
  };
}

function makeMicrostructure(overrides: Record<string, unknown> = {}) {
  return {
    status: "SKIPPED_WEAK_PATH",
    regime: "NO_PATH",
    pathTrusted: false,
    historyQualified: false,
    staleCopyConfidence: 0,
    decayRiskBucket: "UNKNOWN",
    estimatedHalfLifeMinutes: null,
    urgencyScore: 0,
    repricingLikelihood: 0,
    waitImprovementLikelihood: 0,
    scoreDelta: 0,
    timingDelta: 0,
    sourceWeightDelta: 0,
    trapEscalation: false,
    adjustments: {
      pathScoreDelta: 0,
      historyScoreDelta: 0,
      pathTimingDelta: 0,
      historyTimingDelta: 0,
      pathSourceWeightDelta: 0,
      historySourceWeightDelta: 0
    },
    sampleGate: {
      requiredClosed: 12,
      qualifiedSignals: 0,
      insufficientSignals: 0
    },
    summary: "No market-path edge applied.",
    reasons: ["No market-path edge applied."],
    ...overrides
  } as OpportunityView["marketMicrostructure"];
}

function makeSizing(args?: {
  bankrollSettings?: OpportunityBankrollSettings;
  actionState?: OpportunityView["actionState"];
  confidenceTier?: OpportunityView["confidenceTier"];
  expectedValuePct?: number | null;
  marketDisagreementScore?: number | null;
  bookCount?: number;
  sourceQualityScore?: number;
  marketEfficiency?: OpportunityView["marketEfficiency"];
  providerFreshnessMinutes?: number | null;
  truthCalibrationScoreDelta?: number;
  marketMicrostructure?: OpportunityView["marketMicrostructure"] | null;
  trapFlags?: OpportunityView["trapFlags"];
}) {
  return buildPositionSizingGuidance({
    opportunityScore: 84,
    confidenceTier: args?.confidenceTier ?? "A",
    trapFlags: args?.trapFlags ?? [],
    bookCount: args?.bookCount ?? 6,
    providerFreshnessMinutes: args?.providerFreshnessMinutes ?? 2,
    marketDisagreementScore: args?.marketDisagreementScore ?? 0.03,
    marketEfficiency: args?.marketEfficiency ?? "MID_EFFICIENCY",
    bestPriceFlag: true,
    edgeDecay: {
      score: 82,
      penalty: 4,
      label: "FRESH",
      minutesSinceDetection: 2,
      minutesSinceSnapshot: 1,
      compressed: false,
      notes: []
    },
    expectedValuePct: args?.expectedValuePct ?? 5.2,
    fairPriceAmerican: -128,
    displayOddsAmerican: -110,
    actionState: args?.actionState ?? "BET_NOW",
    sourceQualityScore: args?.sourceQualityScore ?? 78,
    sourceHealthState: "HEALTHY",
    truthCalibrationScoreDelta: args?.truthCalibrationScoreDelta ?? 0,
    marketMicrostructure: args?.marketMicrostructure ?? null,
    bankrollSettings: args?.bankrollSettings ?? makeBankrollSettings()
  });
}

function makeOpportunity(
  id: string,
  overrides: {
    bankrollSettings?: OpportunityBankrollSettings;
    eventId?: string;
    eventLabel?: string;
    marketType?: string;
    selectionLabel?: string;
    actionState?: OpportunityView["actionState"];
    timingState?: OpportunityView["timingState"];
    confidenceTier?: OpportunityView["confidenceTier"];
    opportunityScore?: number;
    expectedValuePct?: number | null;
    marketDisagreementScore?: number | null;
    marketEfficiency?: OpportunityView["marketEfficiency"];
    marketMicrostructure?: OpportunityView["marketMicrostructure"] | null;
    trapFlags?: OpportunityView["trapFlags"];
  } = {}
): OpportunityView {
  const sizing = makeSizing({
    bankrollSettings: overrides.bankrollSettings,
    actionState: overrides.actionState,
    confidenceTier: overrides.confidenceTier,
    expectedValuePct: overrides.expectedValuePct,
    marketDisagreementScore: overrides.marketDisagreementScore,
    marketEfficiency: overrides.marketEfficiency,
    marketMicrostructure: overrides.marketMicrostructure,
    trapFlags: overrides.trapFlags
  });

  return {
    id,
    kind: "game_side",
    league: "NBA",
    eventId: overrides.eventId ?? "evt-1",
    eventLabel: overrides.eventLabel ?? "Lakers @ Celtics",
    marketType: overrides.marketType ?? "spread",
    selectionLabel: overrides.selectionLabel ?? "Lakers +4.5",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    displayOddsAmerican: -110,
    displayLine: "+4.5",
    fairPriceAmerican: -128,
    fairPriceMethod: null,
    expectedValuePct: overrides.expectedValuePct ?? 5.2,
    marketDeltaAmerican: 18,
    consensusImpliedProbability: 54,
    marketDisagreementScore: overrides.marketDisagreementScore ?? 0.03,
    providerFreshnessMinutes: 2,
    staleFlag: false,
    bookCount: 6,
    lineMovement: 1.5,
    marketPath: null,
    marketEfficiency: overrides.marketEfficiency ?? "MID_EFFICIENCY",
    sourceQuality: {
      score: 78,
      influenceTier: "MAJOR_RETAIL",
      sharpBookPresent: true,
      notes: []
    } as unknown as OpportunityView["sourceQuality"],
    edgeDecay: {
      score: 82,
      penalty: 4,
      label: "FRESH",
      minutesSinceDetection: 2,
      minutesSinceSnapshot: 1,
      compressed: false,
      notes: []
    },
    marketMicrostructure:
      overrides.marketMicrostructure ??
      makeMicrostructure({
        status: "APPLIED",
        regime: "LEADER_CONFIRMED",
        urgencyScore: 58,
        decayRiskBucket: "MODERATE"
      }),
    sizing,
    executionContext: null,
    edgeScore: 82,
    opportunityScore: overrides.opportunityScore ?? 84,
    confidenceTier: overrides.confidenceTier ?? "A",
    actionState: overrides.actionState ?? "BET_NOW",
    timingState: overrides.timingState ?? "WINDOW_OPEN",
    trapFlags: overrides.trapFlags ?? [],
    whyItShows: [],
    whatCouldKillIt: [],
    reasonSummary: "Test opportunity.",
    personalizationAdjustments: [],
    sourceHealth: {
      state: "HEALTHY",
      freshnessMinutes: 2,
      warnings: []
    },
    sourceNote: "Test source",
    scoreComponents: {
      priceEdge: 16,
      expectedValue: 14,
      marketValidation: 12,
      timingQuality: 84,
      freshness: 6,
      support: 8,
      sourceQuality: 8,
      marketEfficiency: 2,
      edgeDecay: -2,
      truthCalibration: 0,
      marketPath: 0,
      personalization: 0,
      penalties: 0
    },
    truthCalibration: {
      status: "SKIPPED_NO_DATA",
      scoreDelta: 0,
      timingDelta: 0,
      sourceWeightDelta: 0,
      trapEscalation: false,
      trapDeEscalation: false,
      baseScore: overrides.opportunityScore ?? 84,
      calibratedScore: overrides.opportunityScore ?? 84,
      baseTimingQuality: 84,
      calibratedTimingQuality: 84,
      sampleGate: {
        requiredSurfaced: 25,
        requiredClosed: 12,
        qualifiedSignals: 0,
        insufficientSignals: 0
      },
      summary: "No calibration sample.",
      applied: [],
      skipped: []
    },
    truthClassification: null
  };
}

function testHighEvLowUncertaintyProducesReasonableStake() {
  const settings = makeBankrollSettings();
  const sizing = makeSizing({
    bankrollSettings: settings,
    expectedValuePct: 6.1,
    marketDisagreementScore: 0.02,
    confidenceTier: "A",
    bookCount: 6,
    sourceQualityScore: 82
  });

  assert(sizing.recommendedStake > 0, "expected a positive recommended stake");
  assert(sizing.bankrollPct > 0.25, `expected meaningful bankroll allocation, got ${sizing.bankrollPct}`);
  assert(sizing.adjustedKellyFraction <= settings.maxSingleBetPct, "expected single-bet cap to hold");
}

function testHighUncertaintyReducesStake() {
  const settings = makeBankrollSettings();
  const clean = makeSizing({
    bankrollSettings: settings,
    expectedValuePct: 5.2,
    marketDisagreementScore: 0.03,
    confidenceTier: "A",
    sourceQualityScore: 80,
    bookCount: 6
  });
  const noisy = makeSizing({
    bankrollSettings: settings,
    expectedValuePct: 5.2,
    marketDisagreementScore: 0.17,
    confidenceTier: "C",
    sourceQualityScore: 42,
    bookCount: 2,
    marketEfficiency: "FRAGMENTED_PROP"
  });

  assert(noisy.recommendedStake < clean.recommendedStake, "expected uncertainty to reduce stake");
  assert(noisy.reasonCodes.includes("HIGH_MARKET_DISAGREEMENT"), "expected disagreement cap reason");
}

function testCorrelatedBetsReduceExposure() {
  const settings = makeBankrollSettings({
    bankroll: 5_000,
    availableBankroll: 5_000,
    maxEventExposurePct: 0.03,
    maxMarketExposurePct: 0.02
  });
  const allocator = createOpportunityPortfolioAllocator({
    bankrollSettings: settings,
    openPositions: [
      {
        id: "open-1",
        eventId: "evt-1",
        league: "NBA",
        marketType: "spread",
        selection: "Celtics -4.5",
        riskAmount: 120
      }
    ]
  });
  const opportunity = makeOpportunity("opp-1", {
    bankrollSettings: settings,
    eventId: "evt-1",
    marketType: "spread",
    selectionLabel: "Lakers +4.5"
  });
  const [allocated] = allocator.apply([opportunity]);

  assert(
    allocated.sizing.recommendedStake < opportunity.sizing.recommendedStake,
    "expected correlated same-event exposure to cut stake"
  );
  assert(
    allocated.sizing.reasonCodes.includes("CORRELATED_WITH_OPEN_EXPOSURE"),
    "expected correlation reason code"
  );
}

function testCompetingOpportunitiesDownsizeLowerPriorityBet() {
  const settings = makeBankrollSettings({
    bankroll: 4_000,
    availableBankroll: 4_000,
    maxOpenExposurePct: 0.035
  });
  const allocator = createOpportunityPortfolioAllocator({
    bankrollSettings: settings
  });
  const best = makeOpportunity("best", {
    bankrollSettings: settings,
    eventId: "evt-a",
    expectedValuePct: 6.5,
    opportunityScore: 90
  });
  const second = makeOpportunity("second", {
    bankrollSettings: settings,
    eventId: "evt-b",
    expectedValuePct: 3.6,
    opportunityScore: 74,
    confidenceTier: "B"
  });
  const allocated = allocator.apply([best, second]);
  const top = allocated.find((item) => item.id === "best")!;
  const lower = allocated.find((item) => item.id === "second")!;

  assert(
    lower.sizing.recommendedStake <= top.sizing.recommendedStake,
    "expected lower-priority opportunity to be no larger than the best one"
  );
  assert(
    lower.sizing.competitionPenalty <= 1,
    "expected competition penalty to be bounded"
  );
}

function testBankrollConstraintRespected() {
  const settings = makeBankrollSettings({
    bankroll: 1_500,
    availableBankroll: 25,
    maxOpenExposurePct: 0.02
  });
  const sizing = makeSizing({
    bankrollSettings: settings,
    expectedValuePct: 7.5
  });

  assert(sizing.recommendedStake <= 25, `expected stake capped by available bankroll, got ${sizing.recommendedStake}`);
  assert(sizing.reasonCodes.includes("PORTFOLIO_BANKROLL_CAP"), "expected bankroll cap reason");
}

function testZeroStakeForWatchAndPass() {
  const settings = makeBankrollSettings();
  const watch = makeSizing({
    bankrollSettings: settings,
    actionState: "WATCH"
  });
  const pass = makeSizing({
    bankrollSettings: settings,
    actionState: "PASS"
  });

  assert(watch.recommendedStake === 0, `expected WATCH to allocate zero, got ${watch.recommendedStake}`);
  assert(pass.recommendedStake === 0, `expected PASS to allocate zero, got ${pass.recommendedStake}`);
}

function testExecutionScoring() {
  const strongEntry = buildExecutionQualityAssessment({
    bestAvailableOddsAmerican: -108,
    actualOddsAmerican: -108,
    actualLine: 4.5,
    closingOddsAmerican: -125,
    closingLine: 5.5,
    marketType: "spread",
    selectionLabel: "Lakers +4.5",
    placedAt: "2026-04-07T12:00:00.000Z",
    settledAt: "2026-04-07T16:00:00.000Z",
    staleCopyExpected: true
  });
  const poorEntry = buildExecutionQualityAssessment({
    bestAvailableOddsAmerican: -102,
    actualOddsAmerican: -118,
    actualLine: 4.5,
    closingOddsAmerican: -110,
    closingLine: 4.5,
    marketType: "spread",
    selectionLabel: "Lakers +4.5",
    placedAt: "2026-04-07T12:00:00.000Z",
    settledAt: "2026-04-07T16:00:00.000Z"
  });
  const missedStaleCopy = buildExecutionQualityAssessment({
    bestAvailableOddsAmerican: -104,
    actualOddsAmerican: -115,
    actualLine: 26.5,
    closingOddsAmerican: -112,
    closingLine: 26.5,
    marketType: "player_points",
    selectionLabel: "Jayson Tatum over 26.5",
    placedAt: "2026-04-07T12:00:00.000Z",
    settledAt: "2026-04-07T16:00:00.000Z",
    staleCopyExpected: true
  });

  assert(
    (strongEntry.executionScore ?? -1) > (poorEntry.executionScore ?? -1),
    "expected better entry to outscore poor entry"
  );
  assert(poorEntry.missedEdge, "expected poor entry to flag missed edge");
  assert(
    missedStaleCopy.classification === "MISSED_OPPORTUNITY" ||
      missedStaleCopy.timingCorrectness === "MISSED",
    "expected stale-copy miss to grade as missed execution"
  );
}

function testNoRegressionWhenPortfolioDataAbsent() {
  const settings = makeBankrollSettings();
  const allocator = createOpportunityPortfolioAllocator({
    bankrollSettings: settings
  });
  const opportunity = makeOpportunity("solo", {
    bankrollSettings: settings
  });
  const [allocated] = allocator.apply([opportunity]);

  assert(
    allocated.sizing.recommendedStake === opportunity.sizing.recommendedStake,
    "expected neutral allocator to preserve base recommendation"
  );
  assert(allocated.executionContext === null, "expected no execution context without matched entries");
}

function run() {
  testHighEvLowUncertaintyProducesReasonableStake();
  testHighUncertaintyReducesStake();
  testCorrelatedBetsReduceExposure();
  testCompetingOpportunitiesDownsizeLowerPriorityBet();
  testBankrollConstraintRespected();
  testZeroStakeForWatchAndPass();
  testExecutionScoring();
  testNoRegressionWhenPortfolioDataAbsent();
  console.log("opportunity-portfolio tests passed");
}

run();
