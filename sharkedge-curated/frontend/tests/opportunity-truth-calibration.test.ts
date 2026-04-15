import { buildOpportunityScore } from "@/services/opportunities/opportunity-scoring";
import { evaluateMarketSourceQuality } from "@/services/opportunities/opportunity-market-model";
import { buildOpportunityTiming } from "@/services/opportunities/opportunity-timing";
import {
  createOpportunityTruthCalibrationResolver,
  type OpportunityTruthCalibrationContext
} from "@/services/opportunities/opportunity-truth-calibration";
import type { TruthCalibrationSummaryRow } from "@/services/opportunities/opportunity-clv-service";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeSummaryRow(
  label: string,
  overrides: Partial<TruthCalibrationSummaryRow> = {}
): TruthCalibrationSummaryRow {
  return {
    label,
    surfaced: 80,
    closed: 50,
    beatClose: 30,
    lostClose: 15,
    pushClose: 5,
    closeDataRate: 62.5,
    beatClosePct: 60,
    lostClosePct: 30,
    averageClvPct: 1.4,
    averageLineDelta: 0.35,
    averageTruthScore: 1.25,
    averageSurfaceScore: 76,
    averageExpectedValuePct: 2.1,
    ...overrides
  };
}

function makeContext(
  overrides: Partial<OpportunityTruthCalibrationContext> = {}
): OpportunityTruthCalibrationContext {
  return {
    league: "NBA",
    marketType: "spread",
    sportsbookKey: "pinnacle",
    sportsbookName: "Pinnacle",
    timingState: "WINDOW_OPEN",
    actionState: "BET_NOW",
    confidenceTier: "B",
    trapFlags: [],
    sourceHealthState: "HEALTHY",
    baseScore: 78,
    baseTimingQuality: 74,
    ...overrides
  };
}

function testInsufficientSampleFallback() {
  const resolver = createOpportunityTruthCalibrationResolver({
    rowsByGroup: {
      market: [
        makeSummaryRow("spread", {
          surfaced: 18,
          closed: 9,
          beatClosePct: 66.7,
          averageTruthScore: 1.5
        })
      ]
    }
  });

  const view = resolver.resolve(makeContext());

  assert(
    view.status === "SKIPPED_INSUFFICIENT_SAMPLE",
    `expected insufficient-sample skip, got ${view.status}`
  );
  assert(view.scoreDelta === 0, `expected zero score delta, got ${view.scoreDelta}`);
  assert(view.timingDelta === 0, `expected zero timing delta, got ${view.timingDelta}`);
  assert(
    view.skipped.length === 1,
    `expected one skipped signal, got ${view.skipped.length}`
  );
}

function testPositiveFeedbackIncreasesScoreModestly() {
  const resolver = createOpportunityTruthCalibrationResolver({
    rowsByGroup: {
      market: [makeSummaryRow("spread")],
      sportsbook: [makeSummaryRow("Pinnacle", { averageTruthScore: 1.7 })]
    }
  });

  const calibration = resolver.resolve(makeContext());
  const base = buildOpportunityScore({
    expectedValuePct: 2.1,
    fairLineGap: 8,
    edgeScore: 62,
    confidenceScore: 58,
    qualityScore: 54,
    disagreementScore: 0.07,
    freshnessMinutes: 8,
    bookCount: 4,
    timingQuality: 68,
    supportScore: 6,
    sourceQualityScore: 50,
    marketEfficiencyScore: 4,
    edgeDecayPenalty: 10,
    trapFlags: [],
    personalizationDelta: 0
  });
  const boosted = buildOpportunityScore({
    expectedValuePct: 2.1,
    fairLineGap: 8,
    edgeScore: 62,
    confidenceScore: 58,
    qualityScore: 54,
    disagreementScore: 0.07,
    freshnessMinutes: 8,
    bookCount: 4,
    timingQuality: 68,
    supportScore: 6,
    sourceQualityScore: 50,
    marketEfficiencyScore: 4,
    edgeDecayPenalty: 10,
    truthCalibrationScoreDelta: calibration.scoreDelta,
    trapFlags: [],
    personalizationDelta: 0
  });

  assert(calibration.status === "APPLIED", `expected applied calibration, got ${calibration.status}`);
  assert(calibration.scoreDelta > 0, `expected positive score delta, got ${calibration.scoreDelta}`);
  assert(calibration.scoreDelta <= 6, `expected bounded score delta, got ${calibration.scoreDelta}`);
  assert(boosted.score > base.score, `expected boosted score > base (${boosted.score} vs ${base.score})`);
  assert(
    boosted.score - base.score <= 6,
    `expected modest score bump, got ${boosted.score - base.score}`
  );
}

function testNegativeTimingFeedbackCanDemoteAction() {
  const resolver = createOpportunityTruthCalibrationResolver({
    rowsByGroup: {
      timing: [
        makeSummaryRow("WINDOW_OPEN", {
          beatClose: 19,
          lostClose: 27,
          pushClose: 4,
          beatClosePct: 38,
          lostClosePct: 54,
          averageClvPct: -1.2,
          averageTruthScore: -1.4
        })
      ]
    }
  });

  const calibration = resolver.resolve(makeContext());
  const baseTiming = buildOpportunityTiming({
    score: 78,
    expectedValuePct: 1.35,
    lineMovement: 3,
    bestPriceFlag: true,
    freshnessMinutes: 4,
    trapFlags: [],
    disagreementScore: 0.04
  });
  const calibratedTiming = buildOpportunityTiming({
    score: 78,
    expectedValuePct: 1.35,
    lineMovement: 3,
    bestPriceFlag: true,
    freshnessMinutes: 4,
    trapFlags: [],
    disagreementScore: 0.04,
    truthTimingDelta: calibration.timingDelta,
    calibrationTrapEscalation: calibration.trapEscalation
  });

  assert(calibration.status === "APPLIED", `expected applied calibration, got ${calibration.status}`);
  assert(calibration.timingDelta < 0, `expected negative timing delta, got ${calibration.timingDelta}`);
  assert(
    baseTiming.actionState === "BET_NOW",
    `expected base timing to be BET_NOW, got ${baseTiming.actionState}`
  );
  assert(
    calibratedTiming.actionState !== "BET_NOW",
    `expected calibrated timing to demote action, got ${calibratedTiming.actionState}`
  );
  assert(
    calibratedTiming.timingQuality < baseTiming.timingQuality,
    `expected timing quality drop, got ${calibratedTiming.timingQuality} vs ${baseTiming.timingQuality}`
  );
}

function testSportsbookWeightCorrectionStaysWithinBounds() {
  const positive = evaluateMarketSourceQuality({
    league: "NBA",
    marketType: "spread",
    sportsbookKey: "pinnacle",
    sportsbookName: "Pinnacle",
    bookCount: 5,
    disagreementScore: 0.04,
    bestPriceFlag: true,
    freshnessMinutes: 3,
    truthAdjustment: 0.25
  });
  const negative = evaluateMarketSourceQuality({
    league: "NBA",
    marketType: "spread",
    sportsbookKey: "pinnacle",
    sportsbookName: "Pinnacle",
    bookCount: 5,
    disagreementScore: 0.04,
    bestPriceFlag: true,
    freshnessMinutes: 3,
    truthAdjustment: -0.4
  });

  assert(
    positive.truthAdjustment === 0.08,
    `expected positive adjustment clamp at 0.08, got ${positive.truthAdjustment}`
  );
  assert(
    negative.truthAdjustment === -0.12,
    `expected negative adjustment clamp at -0.12, got ${negative.truthAdjustment}`
  );
  assert(
    Number((positive.influenceWeight - positive.baseInfluenceWeight).toFixed(2)) <= 0.08,
    "expected positive weight delta to remain bounded"
  );
  assert(
    Number((negative.baseInfluenceWeight - negative.influenceWeight).toFixed(2)) <= 0.12,
    "expected negative weight delta to remain bounded"
  );
}

function testNoCalibrationLeavesBehaviorUnchanged() {
  const resolver = createOpportunityTruthCalibrationResolver();
  const calibration = resolver.resolve(makeContext());
  const baseScore = buildOpportunityScore({
    expectedValuePct: 3.2,
    fairLineGap: 10,
    edgeScore: 71,
    confidenceScore: 68,
    qualityScore: 66,
    disagreementScore: 0.07,
    freshnessMinutes: 5,
    bookCount: 4,
    timingQuality: 72,
    supportScore: 7,
    trapFlags: [],
    personalizationDelta: 0
  });
  const neutralScore = buildOpportunityScore({
    expectedValuePct: 3.2,
    fairLineGap: 10,
    edgeScore: 71,
    confidenceScore: 68,
    qualityScore: 66,
    disagreementScore: 0.07,
    freshnessMinutes: 5,
    bookCount: 4,
    timingQuality: 72,
    supportScore: 7,
    truthCalibrationScoreDelta: calibration.scoreDelta,
    trapFlags: [],
    personalizationDelta: 0
  });
  const baseTiming = buildOpportunityTiming({
    score: 76,
    expectedValuePct: 2.4,
    lineMovement: 5,
    bestPriceFlag: true,
    freshnessMinutes: 5,
    trapFlags: [],
    disagreementScore: 0.05
  });
  const neutralTiming = buildOpportunityTiming({
    score: 76,
    expectedValuePct: 2.4,
    lineMovement: 5,
    bestPriceFlag: true,
    freshnessMinutes: 5,
    trapFlags: [],
    disagreementScore: 0.05,
    truthTimingDelta: calibration.timingDelta,
    calibrationTrapEscalation: calibration.trapEscalation
  });

  assert(calibration.status === "SKIPPED_NO_DATA", `expected no-data skip, got ${calibration.status}`);
  assert(baseScore.score === neutralScore.score, "expected score to stay unchanged without calibration");
  assert(
    baseTiming.actionState === neutralTiming.actionState &&
      baseTiming.timingState === neutralTiming.timingState &&
      baseTiming.timingQuality === neutralTiming.timingQuality,
    "expected timing behavior to stay unchanged without calibration"
  );
}

function run() {
  testInsufficientSampleFallback();
  testPositiveFeedbackIncreasesScoreModestly();
  testNegativeTimingFeedbackCanDemoteAction();
  testSportsbookWeightCorrectionStaysWithinBounds();
  testNoCalibrationLeavesBehaviorUnchanged();
  console.log("Opportunity truth calibration tests passed.");
}

run();
