import type {
  OpportunityDecisionSnapshotView,
  OpportunityView
} from "@/lib/types/opportunity";
import {
  buildOpportunitySurfaceMetadata,
  type OpportunitySurfaceContext
} from "@/services/opportunities/opportunity-clv-service";
import {
  buildExecutionQualityAssessment,
  createOpportunityExecutionResolver
} from "@/services/opportunities/opportunity-execution";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeOpportunity(overrides: Partial<OpportunityView> = {}): OpportunityView {
  return {
    id: "opp-1",
    kind: "game_side",
    league: "NBA",
    eventId: "evt-1",
    eventLabel: "Lakers @ Celtics",
    marketType: "spread",
    selectionLabel: "Lakers +4.5",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    displayOddsAmerican: -104,
    displayLine: 4.5,
    fairPriceAmerican: -122,
    fairPriceMethod: null,
    expectedValuePct: 4.8,
    marketDeltaAmerican: 16,
    consensusImpliedProbability: 53,
    marketDisagreementScore: 0.04,
    providerFreshnessMinutes: 2,
    staleFlag: false,
    bookCount: 5,
    lineMovement: 1.5,
    marketPath: {
      regime: "STALE_COPY",
      leaderCandidates: ["pinnacle"],
      confirmerBooks: ["circa", "bookmaker"],
      followerBooks: ["fanduel"],
      laggingBooks: ["draftkings"],
      outlierBooks: [],
      confirmationCount: 3,
      confirmationQuality: 78,
      leaderFollowerConfidence: 76,
      synchronizationState: "PARTIAL_CONFIRMATION",
      repriceSpread: 12,
      staleCopyConfidence: 82,
      staleCopyReasons: ["Leader books moved first and DraftKings is hanging the old number."],
      staleCopySuppressed: false,
      executionHint: "HIT_NOW",
      moveCoherenceScore: 74,
      notes: ["Trusted stale-copy path."],
      debug: [
        {
          sportsbookKey: "draftkings",
          sportsbookName: "DraftKings",
          role: "LAGGER",
          lastMoveAt: "2026-04-08T12:00:00.000Z",
          moveCount: 1,
          currentOddsAmerican: -104,
          currentLine: 4.5,
          betterThanConsensus: true,
          notes: ["Still hanging the stale number."]
        },
        {
          sportsbookKey: "circa",
          sportsbookName: "Circa",
          role: "CONFIRMER",
          lastMoveAt: "2026-04-08T11:58:00.000Z",
          moveCount: 2,
          currentOddsAmerican: -118,
          currentLine: 5.5,
          betterThanConsensus: false,
          notes: ["Confirmed the leader move."]
        }
      ]
    },
    marketEfficiency: "MID_EFFICIENCY",
    reasonLanes: [
      {
        key: "path_stale_copy_confirmed",
        category: "path_regime",
        label: "Stale copy confirmed",
        description: "Leader books repriced while the surfaced book was still hanging the stale number."
      }
    ],
    sourceQuality: {
      score: 78,
      label: "Trusted retail screen",
      influenceTier: "MAJOR_RETAIL",
      baseInfluenceWeight: 0.62,
      influenceWeight: 0.62,
      truthAdjustment: 0,
      marketPathAdjustment: 0.05,
      leadershipAdjustment: -0.04,
      marketPathRole: "LAGGER",
      sharpBookPresent: true,
      notes: ["Retail price is confirmed by sharper books."]
    },
    edgeDecay: {
      score: 82,
      penalty: 4,
      label: "FRESH",
      minutesSinceDetection: 1,
      minutesSinceSnapshot: 1,
      compressed: false,
      notes: []
    },
    marketMicrostructure: {
      status: "APPLIED",
      regime: "STALE_COPY",
      pathTrusted: true,
      historyQualified: true,
      staleCopyConfidence: 82,
      decayRiskBucket: "FAST",
      estimatedHalfLifeMinutes: 5,
      urgencyScore: 84,
      repricingLikelihood: 80,
      waitImprovementLikelihood: 12,
      scoreDelta: 5,
      timingDelta: 6,
      sourceWeightDelta: 0.05,
      trapEscalation: false,
      adjustments: {
        pathScoreDelta: 4,
        historyScoreDelta: 1,
        pathTimingDelta: 4,
        historyTimingDelta: 2,
        pathSourceWeightDelta: 0.03,
        historySourceWeightDelta: 0.02
      },
      sampleGate: {
        requiredClosed: 12,
        qualifiedSignals: 18,
        insufficientSignals: 0
      },
      summary: "Trusted stale-copy lane with fast decay.",
      reasons: ["Leader books moved first and DraftKings is late."]
    },
    bookLeadership: {
      status: "APPLIED",
      laneKey: "nba|spread|mid_efficiency|stale_copy",
      laneLabel: "NBA spread mid efficiency stale copy",
      sportsbookIdentity: "draftkings",
      role: "LAGGER",
      surfaced: 44,
      closed: 28,
      requiredSurfaced: 16,
      requiredClosed: 8,
      leaderFrequency: 2.3,
      confirmerFrequency: 8.1,
      lagFrequency: 31.8,
      staleCopyFrequency: 26.4,
      beatClosePct: 63.2,
      averageTruthScore: 1.24,
      influenceAdjustment: -0.04,
      pathConfidenceAdjustment: -0.01,
      staleCopyConfidenceAdjustment: 8,
      notes: ["DraftKings behaves like a lagger in this lane."]
    },
    closeDestination: {
      status: "APPLIED",
      label: "DECAY",
      confidence: "HIGH",
      confidenceScore: 82,
      surfaced: 48,
      closed: 30,
      requiredSurfaced: 16,
      requiredClosed: 8,
      timingDelta: 5,
      scoreDelta: 4,
      sizingMultiplier: 1.08,
      reasonCodes: ["DESTINATION_DECAY", "DESTINATION_HISTORY_QUALIFIED"],
      notes: ["This lane usually gets copied quickly after surface."]
    },
    executionCapacity: {
      status: "APPLIED",
      label: "FRAGILE_STALE",
      confidence: "MEDIUM",
      capacityScore: 68,
      stakeMultiplier: 0.58,
      rankingDelta: -2,
      timingDelta: 1,
      reasonCodes: ["CAPACITY_FRAGILE_STALE"],
      notes: ["Edge is real but fragile."]
    },
    sizing: {
      recommendation: "SMALL",
      units: 0.8,
      label: "Small",
      rationale: "Small stake after risk controls.",
      riskFlags: [],
      bankroll: 10000,
      availableBankroll: 10000,
      unitSize: 100,
      bankrollPct: 0.8,
      baseKellyFraction: 0.012,
      adjustedKellyFraction: 0.008,
      baseStake: 120,
      adjustedStake: 80,
      exposureAdjustedStake: 80,
      competitionAdjustedStake: 80,
      recommendedStake: 80,
      destinationSizingMultiplier: 1.08,
      executionCapacityMultiplier: 0.58,
      exposureAdjustment: 1,
      correlationPenalty: 1,
      competitionPenalty: 1,
      capitalPriorityScore: 86,
      includeInPortfolio: true,
      riskTolerance: "CONSERVATIVE",
      sizingConfidence: "HIGH",
      reasonCodes: ["STALE_COPY_CONFIRMED", "PORTFOLIO_INCLUDED"],
      exposureDiagnostics: []
    },
    executionContext: null,
    edgeScore: 84,
    opportunityScore: 88,
    confidenceTier: "A",
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    trapFlags: [],
    whyItShows: ["Trusted stale-copy path is still open."],
    whatCouldKillIt: ["If the lagging book copies, the edge is gone."],
    reasonSummary: "Test opportunity.",
    personalizationAdjustments: [],
    sourceHealth: {
      state: "HEALTHY",
      freshnessMinutes: 2,
      warnings: []
    },
    sourceNote: "Test source",
    scoreComponents: {
      priceEdge: 14,
      expectedValue: 16,
      marketValidation: 10,
      timingQuality: 84,
      freshness: 6,
      support: 8,
      sourceQuality: 8,
      marketEfficiency: 2,
      simulation: 0,
      edgeDecay: -2,
      truthCalibration: 0,
      reasonCalibration: 0,
      marketPath: 5,
      closeDestination: 4,
      executionCapacity: -2,
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
      baseScore: 88,
      calibratedScore: 88,
      baseTimingQuality: 84,
      calibratedTimingQuality: 84,
      sampleGate: {
        requiredSurfaced: 40,
        requiredClosed: 20,
        qualifiedSignals: 0,
        insufficientSignals: 0
      },
      summary: "No truth calibration sample.",
      applied: [],
      skipped: []
    },
    reasonCalibration: {
      status: "SKIPPED_NO_DATA",
      reasonLanes: [
        {
          key: "path_stale_copy_confirmed",
          category: "path_regime",
          label: "Stale copy confirmed",
          description:
            "Leader books repriced while the surfaced book was still hanging the stale number."
        }
      ],
      scoreDelta: 0,
      timingDelta: 0,
      sourceWeightDelta: 0,
      trapEscalation: false,
      trapDeEscalation: false,
      baseScore: 88,
      calibratedScore: 88,
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
    truthClassification: null,
    ranking: {
      compositeScore: 90,
      capitalEfficiencyScore: 88,
      edgeQualityScore: 87,
      destinationQualityScore: 81,
      executionQualityScore: 70,
      executionCapacityScore: 66,
      marketPathQualityScore: 84,
      portfolioFitScore: 90,
      actionModifier: 4,
      expectedClvScore: 72,
      fragilityScore: 28,
      trendReliabilityScore: 64,
      recommendationTier: "PRIME",
      notes: ["Capital efficiency and stale-copy urgency drive rank."]
    },
    surfacing: {
      status: "SURFACED",
      visibility: "FULL",
      surfacedBecause: "Trusted stale-copy path still exists.",
      cautionReasons: []
    },
    ...overrides,
    triggerSummary: overrides.triggerSummary ?? "Trusted stale-copy path is still open.",
    killSummary: overrides.killSummary ?? "If the lagging book copies, the edge is gone."
  };
}

function testSurfaceMetadataStoresDecisionSnapshot() {
  const opportunity = makeOpportunity();
  const metadata = buildOpportunitySurfaceMetadata({
    opportunity,
    surfaceContext: "home_command" as OpportunitySurfaceContext,
    surfaceKey: "home:evt-1:opp-1",
    surfacedAt: new Date("2026-04-08T12:00:00.000Z")
  });

  assert(metadata.executionSnapshot !== null, "expected execution snapshot metadata");
  assert(metadata.executionSnapshot?.bestAvailableOddsAmerican === -104, "expected stored best price at surface time");
  assert(
    metadata.executionSnapshot?.bestPriceTiedSportsbookKeys.includes("draftkings"),
    "expected tied best books to include the surfaced book"
  );
  assert(metadata.executionSnapshot?.marketPathRegime === "STALE_COPY", "expected market-path regime to persist");
}

function testExecutionUsesStoredDecisionTimeContext() {
  const surfaceOpportunity = makeOpportunity({
    displayOddsAmerican: -104,
    displayLine: 4.5
  });
  const metadata = buildOpportunitySurfaceMetadata({
    opportunity: surfaceOpportunity,
    surfaceContext: "home_command" as OpportunitySurfaceContext,
    surfaceKey: "home:evt-1:opp-1",
    surfacedAt: new Date("2026-04-08T12:00:00.000Z")
  });

  const resolver = createOpportunityExecutionResolver({
    entries: [
      {
        id: "bet-1",
        eventId: "evt-1",
        marketType: "spread",
        selection: "Lakers +4.5",
        oddsAmerican: -110,
        line: 4.5,
        closingOddsAmerican: -122,
        closingLine: 5.5,
        placedAt: "2026-04-08T12:04:00.000Z",
        settledAt: "2026-04-08T16:00:00.000Z",
        sportsbookKey: "draftkings",
        sportsbookName: "DraftKings"
      }
    ],
    surfaceRecords: [
      {
        surfaceKey: "home:evt-1:opp-1",
        eventId: "evt-1",
        marketType: "spread",
        selection: "Lakers +4.5",
        surfaceContext: "home_command",
        surfacedAt: "2026-04-08T12:00:00.000Z",
        displayedOddsAmerican: -104,
        displayedLine: 4.5,
        closeOddsAmerican: -122,
        closeLine: 5.5,
        metadataJson: metadata
      }
    ]
  });

  const currentOpportunity = makeOpportunity({
    displayOddsAmerican: -120,
    displayLine: 5.5
  });
  const execution = resolver.resolve(currentOpportunity);

  assert(execution !== null, "expected a matched execution context");
  assert(execution?.decisionSnapshotUsed, "expected stored decision snapshot to be used");
  assert(execution?.bestAvailableOddsAmerican === -104, "expected stored best price, not current display price");
  assert(execution?.slippageAmerican === 6, `expected slippage vs stored best screen, got ${execution?.slippageAmerican}`);
}

function testStaleCopyCapturedBeatsMissed() {
  const decisionSnapshot = buildOpportunitySurfaceMetadata({
    opportunity: makeOpportunity(),
    surfaceContext: "matchup_for_you" as OpportunitySurfaceContext,
    surfaceKey: "matchup:evt-1:opp-1",
    surfacedAt: new Date("2026-04-08T12:00:00.000Z")
  }).executionSnapshot as OpportunityDecisionSnapshotView | null;

  const captured = buildExecutionQualityAssessment({
    decisionSurfaceKey: decisionSnapshot?.surfaceKey,
    decisionSnapshot,
    actualOddsAmerican: -104,
    actualLine: 4.5,
    closingOddsAmerican: -120,
    closingLine: 5.5,
    marketType: "spread",
    selectionLabel: "Lakers +4.5",
    placedAt: "2026-04-08T12:01:00.000Z",
    settledAt: "2026-04-08T16:00:00.000Z"
  });
  const missed = buildExecutionQualityAssessment({
    decisionSurfaceKey: decisionSnapshot?.surfaceKey,
    decisionSnapshot,
    actualOddsAmerican: -118,
    actualLine: 5.5,
    closingOddsAmerican: -120,
    closingLine: 5.5,
    marketType: "spread",
    selectionLabel: "Lakers +4.5",
    placedAt: "2026-04-08T12:09:00.000Z",
    settledAt: "2026-04-08T16:00:00.000Z"
  });

  assert((captured.executionScore ?? -1) > (missed.executionScore ?? -1), "expected stale-copy capture to grade better than a miss");
  assert(captured.staleCopyCaptured === true, "expected captured stale-copy flag");
  assert(missed.staleCopyCaptured === false, "expected missed stale-copy flag");
}

function testExecutionFallbackWithoutStoredSnapshot() {
  const resolver = createOpportunityExecutionResolver({
    entries: [
      {
        id: "bet-2",
        eventId: "evt-1",
        marketType: "spread",
        selection: "Lakers +4.5",
        oddsAmerican: -118,
        line: 4.5,
        closingOddsAmerican: -112,
        closingLine: 4.5,
        placedAt: "2026-04-08T12:04:00.000Z",
        settledAt: "2026-04-08T16:00:00.000Z",
        sportsbookKey: "draftkings",
        sportsbookName: "DraftKings"
      }
    ]
  });

  const execution = resolver.resolve(
    makeOpportunity({
      displayOddsAmerican: -112,
      displayLine: 4.5
    })
  );

  assert(execution !== null, "expected fallback execution context");
  assert(execution?.decisionSnapshotUsed === false, "expected fallback path without stored snapshot");
  assert(execution?.slippageAmerican === 6, `expected fallback slippage off current display, got ${execution?.slippageAmerican}`);
}

function run() {
  testSurfaceMetadataStoresDecisionSnapshot();
  testExecutionUsesStoredDecisionTimeContext();
  testStaleCopyCapturedBeatsMissed();
  testExecutionFallbackWithoutStoredSnapshot();
  console.log("opportunity-execution tests passed");
}

run();
