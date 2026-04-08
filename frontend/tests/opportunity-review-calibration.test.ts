import { buildOpportunityTiming } from "@/services/opportunities/opportunity-timing";
import {
  buildOpportunityPostCloseReviewView
} from "@/services/opportunities/opportunity-post-close-review";
import {
  createOpportunityReasonCalibrationResolver,
  type OpportunityReasonCalibrationContext,
  type OpportunityReasonCalibrationSummaryRow
} from "@/services/opportunities/opportunity-reason-calibration";
import {
  buildOpportunityTimingReview,
  createOpportunityTimingReplayResolver,
  type OpportunityTimingReviewSummaryRow
} from "@/services/opportunities/opportunity-timing-review";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeReasonRow(
  key: string,
  label: string,
  category: OpportunityReasonCalibrationSummaryRow["category"],
  overrides: Partial<OpportunityReasonCalibrationSummaryRow> = {}
): OpportunityReasonCalibrationSummaryRow {
  return {
    key,
    label,
    category,
    surfaced: 48,
    closed: 28,
    beatClose: 17,
    lostClose: 7,
    pushClose: 4,
    closeDataRate: 58.3,
    beatClosePct: 60.7,
    lostClosePct: 25,
    averageClvPct: 1.4,
    averageTruthScore: 1.05,
    averageSurfaceScore: 78,
    averageExpectedValuePct: 2.2,
    ...overrides
  };
}

function makeReasonContext(
  overrides: Partial<OpportunityReasonCalibrationContext> = {}
): OpportunityReasonCalibrationContext {
  return {
    league: "NBA",
    marketType: "spread",
    marketEfficiency: "MID_EFFICIENCY",
    bestPriceFlag: true,
    bookCount: 5,
    marketDisagreementScore: 0.04,
    sourceQualityScore: 78,
    trapFlags: [],
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    marketPathRegime: "STALE_COPY",
    staleCopyConfidence: 82,
    closeDestinationLabel: "DECAY",
    executionCapacityLabel: "FRAGILE_STALE",
    baseScore: 80,
    baseTimingQuality: 76,
    ...overrides
  };
}

function makeReplayRow(
  groupBy: OpportunityTimingReviewSummaryRow["groupBy"],
  key: string,
  label: string,
  overrides: Partial<OpportunityTimingReviewSummaryRow> = {}
): OpportunityTimingReviewSummaryRow {
  return {
    groupBy,
    key,
    label,
    surfaced: 34,
    replayQualified: 18,
    hitNowCorrect: 9,
    waitWasBetter: 3,
    windowHeld: 3,
    edgeDiedFast: 4,
    staleCopyCaptureWindow: 2,
    averageTimingReviewScore: 72,
    averageClvPct: 1.18,
    ...overrides
  };
}

function makeSurfaceRow(overrides: Record<string, unknown> = {}) {
  return {
    surfaceKey: "surf_1",
    surfacedOpportunityId: "opp_1",
    eventId: "evt_1",
    league: "NBA",
    marketType: "spread",
    selection: "Lakers +4.5",
    surfaceContext: "home_command",
    surfacedAt: new Date("2026-04-08T12:00:00.000Z"),
    sportsbookKey: "draftkings",
    sportsbookName: "DraftKings",
    displayedOddsAmerican: -104,
    displayedLine: 4.5,
    closeOddsAmerican: -118,
    closeLine: 5.5,
    closeState: "AVAILABLE",
    closeCapturedAt: new Date("2026-04-08T12:20:00.000Z"),
    clvPct: 2.4,
    clvResult: "BEAT_CLOSE",
    normalizedTruthScore: 1.6,
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    confidenceTier: "A",
    finalOutcome: "WIN",
    metadataJson: {
      executionSnapshot: {
        surfaceKey: "surf_1",
        surfaceContext: "home_command",
        surfacedAt: "2026-04-08T12:00:00.000Z",
        displayedOddsAmerican: -104,
        displayedLine: 4.5,
        bestAvailableOddsAmerican: -104,
        bestAvailableLine: 4.5,
        bestPriceTiedSportsbookKeys: ["draftkings"],
        bestPriceTiedSportsbookNames: ["DraftKings"],
        marketPathRegime: "STALE_COPY",
        leaderCandidates: ["pinnacle"],
        confirmerBooks: ["circa"],
        followerBooks: ["fanduel"],
        laggingBooks: ["draftkings"],
        outlierBooks: [],
        offeredBookRole: "LAGGER",
        staleCopyConfidence: 82,
        confirmationCount: 3,
        confirmationQuality: 78,
        leaderFollowerConfidence: 76,
        moveCoherenceScore: 74,
        synchronizationState: "PARTIAL_CONFIRMATION",
        providerFreshnessMinutes: 2,
        sourceHealthState: "HEALTHY",
        sourceQualityScore: 78,
        actionState: "BET_NOW",
        timingState: "WINDOW_OPEN",
        opportunityScore: 88,
        confidenceTier: "A",
        recommendedStake: 80,
        bankrollPct: 0.8,
        capitalPriorityScore: 86,
        reasonLanes: [
          {
            key: "path_stale_copy_confirmed",
            category: "path_regime",
            label: "Stale copy confirmed",
            description: "Leader books repriced while a lagger still showed the old number."
          },
          {
            key: "destination_decay",
            category: "destination",
            label: "Destination decay",
            description: "Similar spots usually decay before close."
          }
        ],
        closeDestinationLabel: "DECAY",
        closeDestinationConfidence: "HIGH",
        executionCapacityLabel: "FRAGILE_STALE",
        executionCapacityConfidence: "MEDIUM",
        executionCapacityScore: 68
      }
    },
    ...overrides
  };
}

function testQualifiedReasonLaneAppliesBoundedNudge() {
  const resolver = createOpportunityReasonCalibrationResolver({
    rows: [
      makeReasonRow(
        "path_stale_copy_confirmed",
        "Stale copy confirmed",
        "path_regime"
      )
    ]
  });

  const view = resolver.resolve(makeReasonContext());

  assert(view.status === "APPLIED", `expected applied reason calibration, got ${view.status}`);
  assert(view.scoreDelta > 0, `expected positive score delta, got ${view.scoreDelta}`);
  assert(view.scoreDelta <= 5, `expected bounded score delta, got ${view.scoreDelta}`);
  assert(view.reasonLanes.some((lane) => lane.key === "path_stale_copy_confirmed"), "expected stale-copy reason lane to be present");
}

function testWeakReasonLaneStaysNeutral() {
  const resolver = createOpportunityReasonCalibrationResolver({
    rows: [
      makeReasonRow(
        "path_stale_copy_confirmed",
        "Stale copy confirmed",
        "path_regime",
        {
          surfaced: 12,
          closed: 6,
          beatClosePct: 66.7,
          averageTruthScore: 1.4
        }
      )
    ]
  });

  const view = resolver.resolve(makeReasonContext());

  assert(
    view.status === "SKIPPED_INSUFFICIENT_SAMPLE",
    `expected insufficient-sample skip, got ${view.status}`
  );
  assert(view.scoreDelta === 0, `expected neutral score delta, got ${view.scoreDelta}`);
}

function testTimingReviewDistinguishesHitNowVsWait() {
  const hitNow = buildOpportunityTimingReview(makeSurfaceRow());
  const waitBetter = buildOpportunityTimingReview(
    makeSurfaceRow({
      surfaceKey: "surf_2",
      clvPct: -1.9,
      clvResult: "LOST_CLOSE",
      normalizedTruthScore: -1.2,
      closeOddsAmerican: -96,
      closeLine: 4,
      closeCapturedAt: new Date("2026-04-08T14:00:00.000Z"),
      actionState: "WAIT",
      timingState: "WAIT_FOR_PULLBACK",
      metadataJson: {
        executionSnapshot: {
          surfaceKey: "surf_2",
          surfaceContext: "home_command",
          surfacedAt: "2026-04-08T12:00:00.000Z",
          displayedOddsAmerican: -110,
          displayedLine: 4.5,
          bestAvailableOddsAmerican: -110,
          bestAvailableLine: 4.5,
          bestPriceTiedSportsbookKeys: ["draftkings"],
          bestPriceTiedSportsbookNames: ["DraftKings"],
          marketPathRegime: "BROAD_REPRICE",
          leaderCandidates: ["pinnacle"],
          confirmerBooks: ["circa"],
          followerBooks: ["fanduel"],
          laggingBooks: [],
          outlierBooks: [],
          offeredBookRole: "FOLLOWER",
          staleCopyConfidence: 20,
          confirmationCount: 3,
          confirmationQuality: 72,
          leaderFollowerConfidence: 70,
          moveCoherenceScore: 68,
          synchronizationState: "BROAD_SYNC",
          providerFreshnessMinutes: 2,
          sourceHealthState: "HEALTHY",
          sourceQualityScore: 74,
          actionState: "WAIT",
          timingState: "WAIT_FOR_PULLBACK",
          opportunityScore: 74,
          confidenceTier: "B",
          recommendedStake: 0,
          bankrollPct: 0,
          capitalPriorityScore: 62,
          reasonLanes: [
            {
              key: "destination_improve",
              category: "destination",
              label: "Destination improve",
              description: "Similar spots often improve before close."
            }
          ],
          closeDestinationLabel: "IMPROVE",
          closeDestinationConfidence: "HIGH",
          executionCapacityLabel: "MODERATELY_ACTIONABLE",
          executionCapacityConfidence: "MEDIUM",
          executionCapacityScore: 61
        }
      }
    })
  );

  assert(
    hitNow.classification === "STALE_COPY_CAPTURE_WINDOW" ||
      hitNow.classification === "EDGE_DIED_FAST" ||
      hitNow.classification === "HIT_NOW_CORRECT",
    `expected hit-now classification, got ${hitNow.classification}`
  );
  assert(waitBetter.classification === "WAIT_WAS_BETTER", `expected wait-was-better, got ${waitBetter.classification}`);
}

function testStaleCopyReplaySupportsBetNow() {
  const resolver = createOpportunityTimingReplayResolver({
    rowsByGroup: {
      market_path_regime: [
        makeReplayRow("market_path_regime", "stale_copy", "Stale copy", {
          hitNowCorrect: 10,
          edgeDiedFast: 5,
          staleCopyCaptureWindow: 3,
          waitWasBetter: 1
        })
      ],
      reason_lane: [
        makeReplayRow("reason_lane", "path_stale_copy_confirmed", "Stale copy confirmed", {
          hitNowCorrect: 11,
          edgeDiedFast: 6,
          staleCopyCaptureWindow: 4,
          waitWasBetter: 1
        })
      ]
    }
  });

  const view = resolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketPathRegime: "STALE_COPY",
    staleCopyConfidence: 82,
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    confidenceTier: "A",
    reasonLanes: [
      {
        key: "path_stale_copy_confirmed",
        category: "path_regime",
        label: "Stale copy confirmed",
        description: "Leader books repriced while a lagger still showed the old number."
      }
    ]
  });

  assert(view.status === "APPLIED", `expected applied replay view, got ${view.status}`);
  assert(view.bias === "STRENGTHEN_BET_NOW", `expected bet-now support, got ${view.bias}`);
  assert(view.timingDelta > 0, `expected positive timing delta, got ${view.timingDelta}`);
}

function testImprovementReplaySupportsWait() {
  const resolver = createOpportunityTimingReplayResolver({
    rowsByGroup: {
      market_path_regime: [
        makeReplayRow("market_path_regime", "broad_reprice", "Broad reprice", {
          hitNowCorrect: 2,
          waitWasBetter: 10,
          edgeDiedFast: 1,
          staleCopyCaptureWindow: 0,
          averageTimingReviewScore: 39,
          averageClvPct: -1.3
        })
      ],
      reason_lane: [
        makeReplayRow("reason_lane", "destination_improve", "Destination improve", {
          hitNowCorrect: 1,
          waitWasBetter: 11,
          edgeDiedFast: 0,
          staleCopyCaptureWindow: 0,
          averageTimingReviewScore: 34,
          averageClvPct: -1.6
        })
      ]
    }
  });

  const replay = resolver.resolve({
    league: "NBA",
    marketType: "spread",
    marketPathRegime: "BROAD_REPRICE",
    staleCopyConfidence: 18,
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    confidenceTier: "B",
    reasonLanes: [
      {
        key: "destination_improve",
        category: "destination",
        label: "Destination improve",
        description: "Similar spots often improve before close."
      }
    ]
  });

  const timing = buildOpportunityTiming({
    score: 76,
    expectedValuePct: 1.6,
    lineMovement: 1,
    bestPriceFlag: true,
    freshnessMinutes: 4,
    trapFlags: [],
    disagreementScore: 0.05,
    marketEfficiency: "MID_EFFICIENCY",
    edgeDecayPenalty: 4,
    closeDestinationLabel: "HOLD",
    closeDestinationConfidence: "LOW",
    closeDestinationTimingDelta: 0,
    executionCapacityLabel: "MODERATELY_ACTIONABLE",
    executionCapacityTimingDelta: 0,
    timingReplayDelta: replay.timingDelta,
    timingReplayBias: replay.bias
  });

  assert(replay.bias === "STRENGTHEN_WAIT", `expected wait bias, got ${replay.bias}`);
  assert(timing.actionState === "WAIT", `expected replay-informed WAIT, got ${timing.actionState}`);
}

function testWatchDemotesWhenReplaySaysWindowDies() {
  const replay = createOpportunityTimingReplayResolver({
    rowsByGroup: {
      market_path_regime: [
        makeReplayRow("market_path_regime", "leader_confirmed", "Leader confirmed", {
          hitNowCorrect: 9,
          waitWasBetter: 2,
          edgeDiedFast: 7,
          staleCopyCaptureWindow: 2,
          averageTimingReviewScore: 78,
          averageClvPct: 1.5
        })
      ]
    }
  }).resolve({
    league: "NBA",
    marketType: "spread",
    marketPathRegime: "LEADER_CONFIRMED",
    staleCopyConfidence: 38,
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    confidenceTier: "B",
    reasonLanes: []
  });

  const timing = buildOpportunityTiming({
    score: 78,
    expectedValuePct: 1.4,
    lineMovement: 2,
    bestPriceFlag: true,
    freshnessMinutes: 5,
    trapFlags: ["FAKE_MOVE_RISK"],
    disagreementScore: 0.05,
    marketEfficiency: "MID_EFFICIENCY",
    edgeDecayPenalty: 6,
    closeDestinationLabel: "HOLD",
    closeDestinationConfidence: "LOW",
    closeDestinationTimingDelta: 0,
    executionCapacityLabel: "MODERATELY_ACTIONABLE",
    executionCapacityTimingDelta: 0,
    timingReplayDelta: replay.timingDelta,
    timingReplayBias: replay.bias
  });

  assert(replay.bias === "DEMOTE_WATCH", `expected watch demotion bias, got ${replay.bias}`);
  assert(timing.actionState !== "WATCH", `expected replay to break watch posture, got ${timing.actionState}`);
}

function testPostCloseReviewCarriesReasonsAndTimingVerdict() {
  const review = buildOpportunityPostCloseReviewView({
    row: makeSurfaceRow()
  });

  assert(review.reasonLanes.length >= 1, "expected persisted surfaced reasons");
  assert(review.timingReview.classification !== "NO_REPLAY_CONFIDENCE", "expected replay classification");
  assert(review.summary.includes("CLV"), `expected CLV in summary, got ${review.summary}`);
}

function testReplayFallbackStaysNeutral() {
  const replay = createOpportunityTimingReplayResolver().resolve({
    league: "NBA",
    marketType: "spread",
    marketPathRegime: "NO_PATH",
    staleCopyConfidence: null,
    actionState: "WATCH",
    timingState: "MONITOR_ONLY",
    confidenceTier: "C",
    reasonLanes: []
  });

  assert(replay.status === "SKIPPED_NO_HISTORY", `expected no-history skip, got ${replay.status}`);
  assert(replay.timingDelta === 0, `expected neutral timing delta, got ${replay.timingDelta}`);
}

function run() {
  testQualifiedReasonLaneAppliesBoundedNudge();
  testWeakReasonLaneStaysNeutral();
  testTimingReviewDistinguishesHitNowVsWait();
  testStaleCopyReplaySupportsBetNow();
  testImprovementReplaySupportsWait();
  testWatchDemotesWhenReplaySaysWindowDies();
  testPostCloseReviewCarriesReasonsAndTimingVerdict();
  testReplayFallbackStaysNeutral();
  console.log("Opportunity review calibration tests passed.");
}

run();
