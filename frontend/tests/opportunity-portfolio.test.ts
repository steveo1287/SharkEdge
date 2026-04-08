import type {
  OpportunityBankrollSettings,
  OpportunityView
} from "@/lib/types/opportunity";
import { buildDefaultBankrollSettings } from "@/services/account/user-service";
import { buildExecutionQualityAssessment } from "@/services/opportunities/opportunity-execution";
import { createOpportunityPortfolioAllocator } from "@/services/opportunities/opportunity-portfolio";
import { buildPositionSizingGuidance } from "@/services/opportunities/opportunity-sizing";
import { applyOpportunitySurfacing, buildOpportunitySurfacing } from "@/services/opportunities/opportunity-surfacing";
import { rankOpportunities } from "@/services/opportunities/opportunity-service";

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

function makeBookLeadership(overrides: Record<string, unknown> = {}) {
  return {
    status: "SKIPPED_NO_HISTORY",
    laneKey: null,
    laneLabel: null,
    sportsbookIdentity: "draftkings",
    role: "UNCLASSIFIED",
    surfaced: 0,
    closed: 0,
    requiredSurfaced: 16,
    requiredClosed: 8,
    leaderFrequency: null,
    confirmerFrequency: null,
    lagFrequency: null,
    staleCopyFrequency: null,
    beatClosePct: null,
    averageTruthScore: null,
    influenceAdjustment: 0,
    pathConfidenceAdjustment: 0,
    staleCopyConfidenceAdjustment: 0,
    notes: ["No lane history."]
  } as OpportunityView["bookLeadership"] & typeof overrides;
}

function makeCloseDestination(overrides: Record<string, unknown> = {}) {
  return {
    status: "APPLIED",
    label: "HOLD",
    confidence: "LOW",
    confidenceScore: 40,
    surfaced: 0,
    closed: 0,
    requiredSurfaced: 16,
    requiredClosed: 8,
    timingDelta: 0,
    scoreDelta: 0,
    sizingMultiplier: 1,
    reasonCodes: ["DESTINATION_NEUTRAL"],
    notes: ["Neutral destination."]
  } as OpportunityView["closeDestination"] & typeof overrides;
}

function makeExecutionCapacity(overrides: Record<string, unknown> = {}) {
  return {
    status: "APPLIED",
    label: "MODERATELY_ACTIONABLE",
    confidence: "MEDIUM",
    capacityScore: 62,
    stakeMultiplier: 0.82,
    rankingDelta: 0,
    timingDelta: 0,
    reasonCodes: ["CAPACITY_MODERATE"],
    notes: ["Playable but still size-capped."]
  } as OpportunityView["executionCapacity"] & typeof overrides;
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
  closeDestination?: OpportunityView["closeDestination"] | null;
  executionCapacity?: OpportunityView["executionCapacity"] | null;
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
    closeDestination: args?.closeDestination ?? makeCloseDestination(),
    executionCapacity: args?.executionCapacity ?? makeExecutionCapacity(),
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
    closeDestination?: OpportunityView["closeDestination"] | null;
    executionCapacity?: OpportunityView["executionCapacity"] | null;
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
    closeDestination: overrides.closeDestination,
    executionCapacity: overrides.executionCapacity,
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
    reasonLanes: [
      {
        key: "path_leader_confirmed",
        category: "path_regime",
        label: "Leader confirmed",
        description: "Leader books moved and the broader market confirmed the move."
      }
    ],
    sourceQuality: {
      score: 78,
      label: "Usable source quality",
      influenceTier: "MAJOR_RETAIL",
      baseInfluenceWeight: 0.62,
      influenceWeight: 0.62,
      truthAdjustment: 0,
      marketPathAdjustment: 0,
      leadershipAdjustment: 0,
      marketPathRole: "UNCLASSIFIED",
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
    bookLeadership: makeBookLeadership(),
    closeDestination: overrides.closeDestination ?? makeCloseDestination(),
    executionCapacity: overrides.executionCapacity ?? makeExecutionCapacity(),
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
      reasonCalibration: 0,
      marketPath: 0,
      closeDestination: 0,
      executionCapacity: 0,
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
    reasonCalibration: {
      status: "SKIPPED_NO_DATA",
      reasonLanes: [
        {
          key: "path_leader_confirmed",
          category: "path_regime",
          label: "Leader confirmed",
          description: "Leader books moved and the broader market confirmed the move."
        }
      ],
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
        requiredSurfaced: 24,
        requiredClosed: 12,
        qualifiedSignals: 0,
        insufficientSignals: 0
      },
      summary: "No reason calibration sample.",
      applied: [],
      skipped: []
    },
    timingReplay: {
      status: "SKIPPED_NO_HISTORY",
      laneKey: null,
      laneLabel: null,
      bias: "NEUTRAL",
      confidence: "LOW",
      surfaced: 0,
      replayQualified: 0,
      requiredSurfaced: 20,
      requiredQualified: 10,
      hitNowCorrectPct: null,
      waitWasBetterPct: null,
      edgeDiedFastPct: null,
      averageTimingReviewScore: null,
      averageClvPct: null,
      timingDelta: 0,
      trapEscalation: false,
      summary: "No timing replay sample.",
      reasonCodes: ["TIMING_REPLAY_NEUTRAL"],
      notes: []
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
    availableBankroll: 10,
    maxOpenExposurePct: 0.08,
    maxSingleBetPct: 0.06
  });
  const sizing = makeSizing({
    bankrollSettings: settings,
    expectedValuePct: 12
  });

  assert(sizing.recommendedStake <= 10, `expected stake capped by available bankroll, got ${sizing.recommendedStake}`);
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

function testRankingPrioritizesCapitalOverPosture() {
  const stronger = {
    ...makeOpportunity("stronger", {
      actionState: "WAIT",
      timingState: "WAIT_FOR_PULLBACK",
      opportunityScore: 92,
      confidenceTier: "A"
    }),
    ranking: {
      compositeScore: 91,
      capitalEfficiencyScore: 94,
      edgeQualityScore: 90,
      destinationQualityScore: 72,
      executionQualityScore: 66,
      executionCapacityScore: 74,
      marketPathQualityScore: 74,
      portfolioFitScore: 82,
      actionModifier: 2,
      notes: ["Capital efficiency drives this rank."]
    }
  };
  const cleanerButWeaker = {
    ...makeOpportunity("cleaner", {
      actionState: "BET_NOW",
      timingState: "WINDOW_OPEN",
      opportunityScore: 76,
      confidenceTier: "B"
    }),
    ranking: {
      compositeScore: 73,
      capitalEfficiencyScore: 68,
      edgeQualityScore: 72,
      destinationQualityScore: 46,
      executionQualityScore: 60,
      executionCapacityScore: 52,
      marketPathQualityScore: 58,
      portfolioFitScore: 78,
      actionModifier: 4,
      notes: ["Posture is clean but capital efficiency is weaker."]
    }
  };

  const ranked = rankOpportunities([cleanerButWeaker, stronger]);
  assert(ranked[0].id === "stronger", "expected stronger capital use to outrank cleaner posture");
}

function testFragileEdgeDownsizesInsteadOfSuppressing() {
  const fragile = makeOpportunity("fragile", {
    actionState: "WAIT",
    timingState: "WAIT_FOR_CONFIRMATION",
    opportunityScore: 78,
    confidenceTier: "B",
    trapFlags: ["THIN_MARKET"],
    marketMicrostructure: makeMicrostructure({
      status: "APPLIED",
      regime: "STALE_COPY",
      pathTrusted: true,
      staleCopyConfidence: 76,
      confirmationCount: 2,
      urgencyScore: 72
    })
  });

  const surfacing = buildOpportunitySurfacing(fragile, "home_command");
  const decorated = applyOpportunitySurfacing(fragile, "home_command");

  assert(surfacing.status === "SURFACED", "expected usable fragile edge to stay surfaced");
  assert(surfacing.visibility === "CAUTION", "expected fragile edge to surface under caution");
  assert(
    decorated.whyItShows[0]?.includes("Surfaced"),
    "expected decorated surface explanation to describe why it survived"
  );
}

function testTrulyBadEdgeStillGetsSuppressed() {
  const bad = {
    ...makeOpportunity("bad", {
      actionState: "PASS",
      timingState: "PASS_ON_PRICE",
      opportunityScore: 48,
      confidenceTier: "D",
      trapFlags: ["STALE_EDGE", "LOW_PROVIDER_HEALTH"]
    }),
    sourceHealth: {
      state: "OFFLINE" as const,
      freshnessMinutes: 40,
      warnings: ["Feed offline"]
    },
    staleFlag: true
  };

  const surfacing = buildOpportunitySurfacing(bad, "home_command");
  assert(surfacing.status === "SUPPRESSED", "expected truly bad edge to stay suppressed");
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
  testRankingPrioritizesCapitalOverPosture();
  testFragileEdgeDownsizesInsteadOfSuppressing();
  testTrulyBadEdgeStillGetsSuppressed();
  testNoRegressionWhenPortfolioDataAbsent();
  console.log("opportunity-portfolio tests passed");
}

run();
