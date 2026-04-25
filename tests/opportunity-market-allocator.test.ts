import type { MarketPathView } from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
import { evaluateMarketSourceQuality } from "@/services/opportunities/opportunity-market-model";
import {
  createOpportunityBookLeadershipResolver,
  type OpportunityBookLeadershipSummaryRow
} from "@/services/opportunities/opportunity-book-leadership";
import {
  createOpportunityCloseDestinationResolver,
  type OpportunityCloseDestinationSummaryRow
} from "@/services/opportunities/opportunity-close-destination";
import { buildOpportunityExecutionCapacity } from "@/services/opportunities/opportunity-execution-capacity";
import { buildOpportunityRanking } from "@/services/opportunities/opportunity-ranking";
import { buildPositionSizingGuidance } from "@/services/opportunities/opportunity-sizing";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makePath(overrides: Partial<MarketPathView> = {}): MarketPathView {
  return {
    regime: "STALE_COPY",
    leaderCandidates: ["pinnacle"],
    confirmerBooks: ["circa", "bookmaker"],
    followerBooks: ["fanduel"],
    laggingBooks: ["draftkings"],
    outlierBooks: [],
    confirmationCount: 3,
    confirmationQuality: 80,
    leaderFollowerConfidence: 78,
    synchronizationState: "PARTIAL_CONFIRMATION",
    repriceSpread: 10,
    staleCopyConfidence: 82,
    staleCopyReasons: ["Leader books moved and DraftKings still hangs the old number."],
    staleCopySuppressed: false,
    executionHint: "HIT_NOW",
    moveCoherenceScore: 76,
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
        sportsbookKey: "pinnacle",
        sportsbookName: "Pinnacle",
        role: "LEADER",
        lastMoveAt: "2026-04-08T11:57:00.000Z",
        moveCount: 2,
        currentOddsAmerican: -118,
        currentLine: 5.5,
        betterThanConsensus: false,
        notes: ["Moved first."]
      }
    ],
    ...overrides
  };
}

function makeBookLeadershipSummary(
  overrides: Partial<OpportunityBookLeadershipSummaryRow> = {}
): OpportunityBookLeadershipSummaryRow {
  return {
    laneKey: "nba|spread|mid_efficiency|stale_copy",
    laneLabel: "NBA spread mid efficiency stale copy",
    sportsbookIdentity: "draftkings",
    surfaced: 40,
    closed: 24,
    beatClose: 15,
    leaderCount: 1,
    confirmerCount: 4,
    followerCount: 6,
    lagCount: 14,
    outlierCount: 2,
    staleCopyCount: 12,
    truthScoreTotal: 20,
    truthScoreSamples: 24,
    ...overrides
  };
}

function makeDestinationSummary(
  overrides: Partial<OpportunityCloseDestinationSummaryRow> = {}
): OpportunityCloseDestinationSummaryRow {
  return {
    laneKey: "nba|spread|mid_efficiency|stale_copy",
    laneLabel: "NBA spread mid efficiency stale copy",
    surfaced: 42,
    closed: 26,
    beatClose: 17,
    lostClose: 6,
    truthScoreTotal: 23,
    truthScoreSamples: 26,
    clvPctTotal: 41,
    clvPctSamples: 26,
    ...overrides
  };
}

function makeMicrostructure(overrides: Partial<OpportunityView["marketMicrostructure"]> = {}) {
  return {
    status: "APPLIED",
    regime: "STALE_COPY",
    pathTrusted: true,
    historyQualified: true,
    staleCopyConfidence: 82,
    decayRiskBucket: "FAST",
    estimatedHalfLifeMinutes: 5,
    urgencyScore: 84,
    repricingLikelihood: 80,
    waitImprovementLikelihood: 14,
    scoreDelta: 5,
    timingDelta: 5,
    sourceWeightDelta: 0.06,
    trapEscalation: false,
    adjustments: {
      pathScoreDelta: 4,
      historyScoreDelta: 1,
      pathTimingDelta: 4,
      historyTimingDelta: 1,
      pathSourceWeightDelta: 0.03,
      historySourceWeightDelta: 0.03
    },
    sampleGate: {
      requiredClosed: 12,
      qualifiedSignals: 16,
      insufficientSignals: 0
    },
    summary: "Trusted path.",
    reasons: ["Trusted path."],
    ...overrides
  } as OpportunityView["marketMicrostructure"];
}

function makeCloseDestination(overrides: Partial<OpportunityView["closeDestination"]> = {}) {
  return {
    status: "APPLIED",
    label: "DECAY",
    confidence: "HIGH",
    confidenceScore: 82,
    surfaced: 42,
    closed: 26,
    requiredSurfaced: 16,
    requiredClosed: 8,
    timingDelta: 5,
    scoreDelta: 4,
    sizingMultiplier: 1.08,
    reasonCodes: ["DESTINATION_DECAY", "DESTINATION_HISTORY_QUALIFIED"],
    notes: ["This lane usually decays quickly."],
    ...overrides
  } as OpportunityView["closeDestination"];
}

function makeExecutionCapacity(overrides: Partial<OpportunityView["executionCapacity"]> = {}) {
  return {
    status: "APPLIED",
    label: "FULLY_ACTIONABLE",
    confidence: "HIGH",
    capacityScore: 82,
    stakeMultiplier: 1,
    rankingDelta: 4,
    timingDelta: 2,
    reasonCodes: ["CAPACITY_ACTIONABLE"],
    notes: ["Edge is deployable at real size."],
    ...overrides
  } as OpportunityView["executionCapacity"];
}

function makeBookLeadership(overrides: Partial<OpportunityView["bookLeadership"]> = {}) {
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
    notes: ["No lane history."],
    ...overrides
  } as OpportunityView["bookLeadership"];
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
    displayOddsAmerican: -110,
    displayLine: "+4.5",
    fairPriceAmerican: -128,
    fairPriceMethod: null,
    expectedValuePct: 4.8,
    marketDeltaAmerican: 18,
    consensusImpliedProbability: 54,
    marketDisagreementScore: 0.03,
    providerFreshnessMinutes: 2,
    staleFlag: false,
    bookCount: 6,
    lineMovement: 1.5,
    marketPath: makePath(),
    marketEfficiency: "MID_EFFICIENCY",
    reasonLanes: [
      {
        key: "path_stale_copy_confirmed",
        category: "path_regime",
        label: "Stale copy confirmed",
        description: "Leader books repriced while the lagger still showed the old number."
      }
    ],
    sourceQuality: {
      score: 78,
      label: "Usable source quality",
      influenceTier: "MAJOR_RETAIL",
      baseInfluenceWeight: 0.62,
      influenceWeight: 0.66,
      truthAdjustment: 0,
      marketPathAdjustment: 0.04,
      leadershipAdjustment: 0,
      marketPathRole: "LAGGER",
      sharpBookPresent: true,
      notes: []
    },
    edgeDecay: {
      score: 82,
      penalty: 4,
      label: "FRESH",
      minutesSinceDetection: 2,
      minutesSinceSnapshot: 1,
      compressed: false,
      notes: []
    },
    marketMicrostructure: makeMicrostructure(),
    bookLeadership: {
      status: "APPLIED",
      laneKey: "nba|spread|mid_efficiency|stale_copy",
      laneLabel: "NBA spread mid efficiency stale copy",
      sportsbookIdentity: "draftkings",
      role: "LAGGER",
      surfaced: 40,
      closed: 24,
      requiredSurfaced: 16,
      requiredClosed: 8,
      leaderFrequency: 2.5,
      confirmerFrequency: 10,
      lagFrequency: 35,
      staleCopyFrequency: 30,
      beatClosePct: 62,
      averageTruthScore: 1.1,
      influenceAdjustment: -0.04,
      pathConfidenceAdjustment: -0.01,
      staleCopyConfidenceAdjustment: 8,
      notes: ["Lagging book lane."]
    },
    closeDestination: makeCloseDestination(),
    executionCapacity: makeExecutionCapacity(),
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
      executionCapacityMultiplier: 1,
      exposureAdjustment: 1,
      correlationPenalty: 1,
      competitionPenalty: 1,
      capitalPriorityScore: 86,
      includeInPortfolio: true,
      riskTolerance: "CONSERVATIVE",
      sizingConfidence: "HIGH",
      reasonCodes: ["PORTFOLIO_INCLUDED"],
      exposureDiagnostics: []
    },
    executionContext: null,
    ranking: null,
    surfacing: null,
    edgeScore: 82,
    opportunityScore: 88,
    confidenceTier: "A",
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    trapFlags: [],
    whyItShows: [],
    whatCouldKillIt: [],
    triggerSummary: "Test trigger summary.",
    killSummary: "Test kill summary.",
    reasonSummary: "Test.",
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
      timingQuality: 12,
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
      executionCapacity: 2,
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
        requiredSurfaced: 25,
        requiredClosed: 12,
        qualifiedSignals: 0,
        insufficientSignals: 0
      },
      summary: "No calibration.",
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
          description: "Leader books repriced while the lagger still showed the old number."
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
      summary: "No reason calibration.",
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
      summary: "No timing replay.",
      reasonCodes: ["TIMING_REPLAY_NEUTRAL"],
      notes: []
    },
    truthClassification: null,
    ...overrides
  };
}

function testStrongStaleCopyLaneLeadsToDecay() {
  const leadershipResolver = createOpportunityBookLeadershipResolver({
    summaries: [makeBookLeadershipSummary()]
  });
  const destinationResolver = createOpportunityCloseDestinationResolver({
    summaries: [makeDestinationSummary()]
  });
  const marketPath = makePath();
  const marketMicrostructure = makeMicrostructure();
  const bookLeadership = leadershipResolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    marketPath
  });
  const destination = destinationResolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    bestPriceFlag: true,
    marketDisagreementScore: 0.03,
    providerFreshnessMinutes: 2,
    sourceHealthState: "HEALTHY",
    marketPath,
    marketMicrostructure,
    bookLeadership
  });

  assert(destination.label === "DECAY", `expected DECAY, got ${destination.label}`);
  assert(destination.confidence !== "LOW", "expected non-low confidence on trusted stale-copy lane");
}

function testImprovementProneBroadRepriceLaneLeadsToImprove() {
  const destinationResolver = createOpportunityCloseDestinationResolver({
    summaries: [
      makeDestinationSummary({
        laneKey: "nba|spread|mid_efficiency|broad_reprice",
        laneLabel: "NBA spread mid efficiency broad reprice",
        beatClose: 7,
        lostClose: 15,
        truthScoreTotal: -18,
        clvPctTotal: -28
      })
    ]
  });
  const destination = destinationResolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    bestPriceFlag: false,
    marketDisagreementScore: 0.05,
    providerFreshnessMinutes: 3,
    sourceHealthState: "HEALTHY",
    marketPath: makePath({
      regime: "BROAD_REPRICE",
      staleCopyConfidence: 20,
      executionHint: "WAIT_FOR_COPY",
      laggingBooks: [],
      debug: []
    }),
    marketMicrostructure: makeMicrostructure({
      regime: "BROAD_REPRICE",
      staleCopyConfidence: 20,
      repricingLikelihood: 48,
      waitImprovementLikelihood: 78,
      urgencyScore: 34,
      scoreDelta: -1,
      timingDelta: -2
    }),
    bookLeadership: makeOpportunity().bookLeadership
  });

  assert(destination.label === "IMPROVE", `expected IMPROVE, got ${destination.label}`);
}

function testWeakNoisyLaneStaysLowConfidence() {
  const destinationResolver = createOpportunityCloseDestinationResolver();
  const destination = destinationResolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    bestPriceFlag: false,
    marketDisagreementScore: 0.19,
    providerFreshnessMinutes: 18,
    sourceHealthState: "DEGRADED",
    marketPath: null,
    marketMicrostructure: makeMicrostructure({
      status: "SKIPPED_WEAK_PATH",
      regime: "NO_PATH",
      pathTrusted: false,
      urgencyScore: 0,
      staleCopyConfidence: 0,
      repricingLikelihood: 0,
      waitImprovementLikelihood: 0
    }),
    bookLeadership: makeBookLeadership()
  });

  assert(destination.confidence === "LOW", "expected low confidence fallback");
  assert(destination.status !== "APPLIED" || destination.label === "HOLD", "expected safe fallback behavior");
}

function testLaneSpecificBookHistoryAdjustsSourceInfluenceWithinBounds() {
  const leadershipResolver = createOpportunityBookLeadershipResolver({
    summaries: [
      makeBookLeadershipSummary({
        sportsbookIdentity: "pinnacle",
        leaderCount: 18,
        confirmerCount: 8,
        lagCount: 1,
        beatClose: 18,
        truthScoreTotal: 28
      })
    ]
  });
  const leadership = leadershipResolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    sportsbookKey: "pinnacle",
    sportsbookName: "Pinnacle",
    marketPath: makePath({
      debug: [
        {
          sportsbookKey: "pinnacle",
          sportsbookName: "Pinnacle",
          role: "LEADER",
          lastMoveAt: "2026-04-08T11:57:00.000Z",
          moveCount: 2,
          currentOddsAmerican: -118,
          currentLine: 5.5,
          betterThanConsensus: false,
          notes: ["Moved first."]
        }
      ]
    })
  });
  const sourceQuality = evaluateMarketSourceQuality({
    league: "NBA",
    marketType: "spread",
    sportsbookKey: "pinnacle",
    sportsbookName: "Pinnacle",
    bookCount: 6,
    disagreementScore: 0.03,
    bestPriceFlag: false,
    freshnessMinutes: 2,
    truthAdjustment: 0,
    marketPathAdjustment: 0.03,
    leadershipAdjustment: leadership.influenceAdjustment,
    marketPathRole: "LEADER",
    marketPathNote: "Leader book"
  });

  assert(leadership.influenceAdjustment > 0, "expected positive lane-based influence nudge");
  assert(sourceQuality.influenceWeight > sourceQuality.baseInfluenceWeight, "expected source weight to rise above static prior");
  assert(sourceQuality.influenceWeight <= 1.18, "expected bounded source influence");
}

function testLaggingBookInWeakLaneLosesInfluence() {
  const leadershipResolver = createOpportunityBookLeadershipResolver({
    summaries: [
      makeBookLeadershipSummary({
        beatClose: 8,
        closed: 20,
        truthScoreTotal: -18,
        lagCount: 14,
        staleCopyCount: 3
      })
    ]
  });
  const leadership = leadershipResolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    marketPath: makePath()
  });

  assert(leadership.influenceAdjustment < 0, "expected weak lagging lane to lose source influence");
  assert(leadership.staleCopyConfidenceAdjustment <= 0, "expected stale-copy confidence to stay capped in weak lane");
}

function testFragileScreenValueEdgeGetsStakeCut() {
  const fragileCapacity = buildOpportunityExecutionCapacity({
    marketType: "player_points",
    marketEfficiency: "FRAGMENTED_PROP",
    bookCount: 2,
    bestPriceFlag: true,
    providerFreshnessMinutes: 9,
    sourceHealthState: "HEALTHY",
    marketDisagreementScore: 0.16,
    sourceQualityScore: 46,
    marketMicrostructure: makeMicrostructure({
      regime: "STALE_COPY",
      staleCopyConfidence: 74,
      urgencyScore: 68,
      pathTrusted: true
    }),
    bookLeadership: makeBookLeadership({ role: "LAGGER", staleCopyConfidenceAdjustment: 6 }),
    closeDestination: makeCloseDestination({ label: "DECAY", confidence: "MEDIUM", sizingMultiplier: 1.04 })
  });
  const actionableCapacity = buildOpportunityExecutionCapacity({
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    bookCount: 6,
    bestPriceFlag: true,
    providerFreshnessMinutes: 2,
    sourceHealthState: "HEALTHY",
    marketDisagreementScore: 0.03,
    sourceQualityScore: 80,
    marketMicrostructure: makeMicrostructure({
      regime: "LEADER_CONFIRMED",
      staleCopyConfidence: 32,
      urgencyScore: 72,
      pathTrusted: true
    }),
    bookLeadership: makeBookLeadership({ role: "CONFIRMER", influenceAdjustment: 0.03, pathConfidenceAdjustment: 0.03 }),
    closeDestination: makeCloseDestination({ label: "DECAY", confidence: "HIGH", sizingMultiplier: 1.08 })
  });

  const fragileSizing = buildPositionSizingGuidance({
    opportunityScore: 82,
    confidenceTier: "B",
    trapFlags: [],
    bookCount: 2,
    providerFreshnessMinutes: 9,
    marketDisagreementScore: 0.16,
    marketEfficiency: "FRAGMENTED_PROP",
    bestPriceFlag: true,
    edgeDecay: {
      score: 78,
      penalty: 8,
      label: "FRESH",
      minutesSinceDetection: 2,
      minutesSinceSnapshot: 1,
      compressed: false,
      notes: []
    },
    expectedValuePct: 4.5,
    fairPriceAmerican: -122,
    displayOddsAmerican: -104,
    actionState: "BET_NOW",
    sourceQualityScore: 46,
    sourceHealthState: "HEALTHY",
    marketMicrostructure: makeMicrostructure({ regime: "STALE_COPY", staleCopyConfidence: 74, urgencyScore: 68, pathTrusted: true }),
    closeDestination: makeCloseDestination({ label: "DECAY", confidence: "MEDIUM", sizingMultiplier: 1.04 }),
    executionCapacity: fragileCapacity
  });
  const actionableSizing = buildPositionSizingGuidance({
    opportunityScore: 82,
    confidenceTier: "A",
    trapFlags: [],
    bookCount: 6,
    providerFreshnessMinutes: 2,
    marketDisagreementScore: 0.03,
    marketEfficiency: "MID_EFFICIENCY",
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
    expectedValuePct: 4.5,
    fairPriceAmerican: -122,
    displayOddsAmerican: -104,
    actionState: "BET_NOW",
    sourceQualityScore: 80,
    sourceHealthState: "HEALTHY",
    marketMicrostructure: makeMicrostructure({ regime: "LEADER_CONFIRMED", staleCopyConfidence: 30, urgencyScore: 72, pathTrusted: true }),
    closeDestination: makeCloseDestination({ label: "DECAY", confidence: "HIGH", sizingMultiplier: 1.08 }),
    executionCapacity: actionableCapacity
  });

  assert(fragileSizing.recommendedStake < actionableSizing.recommendedStake, "expected fragile screen-value edge to size smaller");
  assert(fragileSizing.executionCapacityMultiplier < actionableSizing.executionCapacityMultiplier, "expected capacity multiplier to cut fragile size");
}

function testRankingDemotesCleanPostureWhenDestinationAndCapacityAreWeak() {
  const cleanButWeak = makeOpportunity({
    id: "clean",
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    closeDestination: makeCloseDestination({ label: "MOSTLY_PRICED", confidence: "HIGH", confidenceScore: 80, scoreDelta: -4 }),
    executionCapacity: makeExecutionCapacity({ label: "SCREEN_VALUE_ONLY", capacityScore: 28, rankingDelta: -8, stakeMultiplier: 0.28 }),
    sizing: {
      ...makeOpportunity().sizing,
      executionCapacityMultiplier: 0.28,
      recommendedStake: 20,
      bankrollPct: 0.2,
      label: "Micro",
      recommendation: "MICRO"
    }
  });
  const messyButReal = makeOpportunity({
    id: "real",
    actionState: "WAIT",
    timingState: "WAIT_FOR_PULLBACK",
    closeDestination: makeCloseDestination({ label: "DECAY", confidence: "HIGH", confidenceScore: 84, scoreDelta: 4 }),
    executionCapacity: makeExecutionCapacity({ label: "FULLY_ACTIONABLE", capacityScore: 84, rankingDelta: 4, stakeMultiplier: 1 }),
    sizing: {
      ...makeOpportunity().sizing,
      recommendedStake: 95,
      bankrollPct: 0.95,
      label: "Standard",
      recommendation: "STANDARD"
    }
  });

  const ranked = [cleanButWeak, messyButReal]
    .map((opportunity) => ({ ...opportunity, ranking: buildOpportunityRanking(opportunity) }))
    .sort((left, right) => (right.ranking?.compositeScore ?? 0) - (left.ranking?.compositeScore ?? 0));

  assert(ranked[0].id === "real", "expected strong destination/capacity to outrank clean posture");
}

function testNoRegressionFallbackWhenLaneHistoryAbsent() {
  const leadershipResolver = createOpportunityBookLeadershipResolver();
  const leadership = leadershipResolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    marketPath: makePath()
  });
  const sourceQuality = evaluateMarketSourceQuality({
    league: "NBA",
    marketType: "spread",
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    bookCount: 6,
    disagreementScore: 0.03,
    bestPriceFlag: true,
    freshnessMinutes: 2,
    truthAdjustment: 0,
    marketPathAdjustment: 0.04,
    leadershipAdjustment: leadership.influenceAdjustment,
    marketPathRole: "LAGGER",
    marketPathNote: "Trusted stale-copy path."
  });

  assert(leadership.status !== "APPLIED", "expected neutral fallback without lane history");
  assert(sourceQuality.leadershipAdjustment === 0, "expected source quality to preserve baseline without history");
}

function run() {
  testStrongStaleCopyLaneLeadsToDecay();
  testImprovementProneBroadRepriceLaneLeadsToImprove();
  testWeakNoisyLaneStaysLowConfidence();
  testLaneSpecificBookHistoryAdjustsSourceInfluenceWithinBounds();
  testLaggingBookInWeakLaneLosesInfluence();
  testFragileScreenValueEdgeGetsStakeCut();
  testRankingDemotesCleanPostureWhenDestinationAndCapacityAreWeak();
  testNoRegressionFallbackWhenLaneHistoryAbsent();
  console.log("opportunity-market-allocator tests passed");
}

run();
