import assert from "node:assert/strict";

import { buildUfcDeepProfileLearnedWeights } from "@/services/ufc/deep-profile-weight-store";
import type { UfcDeepProfileCalibrationReport } from "@/services/ufc/deep-profile-calibration";

function report(overrides: Partial<UfcDeepProfileCalibrationReport> = {}): UfcDeepProfileCalibrationReport {
  return {
    modelVersion: "ufc-deep-profile-calibration-v1",
    fightId: "fight-1",
    generatedAt: "2026-06-08T12:00:00.000Z",
    predictionSummary: "A by control",
    actualSummary: "B by KO/TKO R1",
    correct: { winner: false, methodFamily: false, roundBand: true, topPath: false, dangerZone: true },
    scores: { calibrationError: 44, winnerError: 50, methodError: 38, roundError: 0, phaseError: 22, dangerError: 0, confidencePenalty: 20 },
    signals: [],
    adjustments: [
      { type: "PROFILE_RATING_WEIGHT", target: "overallEdge", direction: "DOWN", magnitude: 0.18, reason: "winner miss" },
      { type: "PHASE_WEIGHT", target: "wrestling", direction: "DOWN", magnitude: 0.2, reason: "phase miss" },
      { type: "METHOD_PRIOR", target: "DECISION_CONTROL", direction: "DOWN", magnitude: 0.22, reason: "method miss" },
      { type: "METHOD_PRIOR", target: "KO_TKO", direction: "UP", magnitude: 0.12, reason: "actual method" },
      { type: "CONFIDENCE_CAP", target: "deepProfileMatchup", direction: "DOWN", magnitude: 0.14, reason: "high confidence miss" }
    ],
    summary: "High calibration miss",
    ...overrides
  };
}

const weights = buildUfcDeepProfileLearnedWeights([
  report(),
  report({ fightId: "fight-2", scores: { calibrationError: 18, winnerError: 0, methodError: 0, roundError: 12, phaseError: 10, dangerError: 0, confidencePenalty: 0 }, correct: { winner: true, methodFamily: true, roundBand: false, topPath: true, dangerZone: null }, adjustments: [
    { type: "ROUND_PRIOR", target: "roundLeverage", direction: "DOWN", magnitude: 0.08, reason: "round miss" },
    { type: "RISK_FLAG_WEIGHT", target: "dangerZones", direction: "UP", magnitude: 0.05, reason: "danger zone useful" }
  ] })
], "2026-06-09T00:00:00.000Z");

assert.equal(weights.modelVersion, "ufc-deep-profile-learned-weights-v1");
assert.equal(weights.reportCount, 2);
assert.equal(weights.highMissCount, 1);
assert.ok(weights.avgCalibrationError > 20);
assert.ok(weights.phaseWeights.wrestling < 1);
assert.ok(weights.methodPriors.DECISION_CONTROL < 1);
assert.ok(weights.methodPriors.KO_TKO > 1);
assert.ok(weights.roundPriors.roundLeverage < 1);
assert.ok(weights.dangerZoneWeights.dangerZones > 1);
assert.ok(weights.profileRatingWeights.overallEdge < 1);
assert.ok(weights.confidenceCaps.deepProfileMatchup < 0.96);
assert.equal(weights.adjustmentCounts.PROFILE_RATING_WEIGHT, 1);
assert.equal(weights.sourceSummary.winnerMisses, 1);
assert.equal(weights.sourceSummary.confidenceMisses, 1);
assert.ok(weights.summary.includes("2 reports"));

const neutral = buildUfcDeepProfileLearnedWeights([], "2026-06-09T00:00:00.000Z");
assert.equal(neutral.reportCount, 0);
assert.equal(neutral.phaseWeights.standing, 1);
assert.ok(neutral.summary.includes("No calibration reports"));

console.log("ufc-deep-profile-weight-store.test.ts passed");
