import assert from "node:assert/strict";

import { applyUfcDeepProfileLearnedWeights } from "@/services/ufc/deep-profile-sim-adjuster";
import { buildUfcDeepProfileLearnedWeights } from "@/services/ufc/deep-profile-weight-store";
import type { UfcDeepProfileCalibrationReport } from "@/services/ufc/deep-profile-calibration";
import type { UfcDeepProfileMatchup } from "@/services/ufc/deep-profile-matchup-engine";

const matchup: UfcDeepProfileMatchup = {
  modelVersion: "ufc-deep-profile-matchup-engine-v1",
  generatedAt: "2026-06-08T12:00:00.000Z",
  fightId: "fight-adjust-1",
  fighterA: { fighterId: "a", fighterName: "Control Fighter", archetype: "CHAIN_WRESTLER", overall: 76, confidence: 0.84 },
  fighterB: { fighterId: "b", fighterName: "Power Fighter", archetype: "POWER_PUNCHER", overall: 72, confidence: 0.8 },
  overallEdge: { leader: "A", edge: 12, confidence: 0.86, summary: "A leads by 12." },
  phaseEdges: {
    standing: { phase: "standing", fighterA: 62, fighterB: 76, edge: -14, leader: "B", confidence: 0.8, drivers: [], summary: "standing B" },
    clinch: { phase: "clinch", fighterA: 70, fighterB: 58, edge: 12, leader: "A", confidence: 0.8, drivers: [], summary: "clinch A" },
    wrestling: { phase: "wrestling", fighterA: 84, fighterB: 50, edge: 34, leader: "A", confidence: 0.84, drivers: [], summary: "wrestling A" },
    grappling: { phase: "grappling", fighterA: 78, fighterB: 52, edge: 26, leader: "A", confidence: 0.82, drivers: [], summary: "grappling A" },
    cardio: { phase: "cardio", fighterA: 70, fighterB: 58, edge: 12, leader: "A", confidence: 0.75, drivers: [], summary: "cardio A" },
    durability: { phase: "durability", fighterA: 66, fighterB: 60, edge: 6, leader: "A", confidence: 0.72, drivers: [], summary: "durability A" },
    finish: { phase: "finish", fighterA: 70, fighterB: 80, edge: -10, leader: "B", confidence: 0.78, drivers: [], summary: "finish B" },
    decision: { phase: "decision", fighterA: 82, fighterB: 62, edge: 20, leader: "A", confidence: 0.82, drivers: [], summary: "decision A" }
  },
  topPhaseEdges: [],
  dangerZones: [],
  winConditionPaths: [
    { fighter: "A", fighterId: "a", fighterName: "Control Fighter", condition: "DECISION_CONTROL", score: 88, confidence: 0.84, phaseLink: "wrestling", drivers: [], summary: "A control" },
    { fighter: "B", fighterId: "b", fighterName: "Power Fighter", condition: "KO_TKO", score: 78, confidence: 0.8, phaseLink: "finish", drivers: [], summary: "B KO" },
    { fighter: "A", fighterId: "a", fighterName: "Control Fighter", condition: "SUBMISSION", score: 71, confidence: 0.76, phaseLink: "grappling", drivers: [], summary: "A sub" }
  ],
  roundLeverage: [],
  simModifiers: { fighterA: {}, fighterB: {}, matchup: { standingDelta: -0.14, wrestlingDelta: 0.34, grapplingDelta: 0.26, finishDelta: -0.1, decisionDelta: 0.2, volatility: 0.55, trustPenalty: 0.08 } },
  warnings: [],
  summary: "A profile edge"
};
matchup.topPhaseEdges = Object.values(matchup.phaseEdges).sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge)).slice(0, 5);

const calibrationReport: UfcDeepProfileCalibrationReport = {
  modelVersion: "ufc-deep-profile-calibration-v1",
  fightId: "fight-adjust-1",
  generatedAt: "2026-06-09T00:00:00.000Z",
  predictionSummary: "A by control",
  actualSummary: "B by KO/TKO",
  correct: { winner: false, methodFamily: false, roundBand: true, topPath: false, dangerZone: true },
  scores: { calibrationError: 48, winnerError: 54, methodError: 38, roundError: 0, phaseError: 24, dangerError: 0, confidencePenalty: 24 },
  signals: [],
  adjustments: [
    { type: "PROFILE_RATING_WEIGHT", target: "overallEdge", direction: "DOWN", magnitude: 0.2, reason: "winner miss" },
    { type: "PHASE_WEIGHT", target: "wrestling", direction: "DOWN", magnitude: 0.24, reason: "control overvalued" },
    { type: "METHOD_PRIOR", target: "DECISION_CONTROL", direction: "DOWN", magnitude: 0.22, reason: "decision control missed" },
    { type: "METHOD_PRIOR", target: "KO_TKO", direction: "UP", magnitude: 0.16, reason: "KO/TKO happened" },
    { type: "CONFIDENCE_CAP", target: "deepProfileMatchup", direction: "DOWN", magnitude: 0.18, reason: "overconfident miss" }
  ],
  summary: "High calibration miss"
};

const weights = buildUfcDeepProfileLearnedWeights([calibrationReport], "2026-06-09T00:00:00.000Z");
const adjusted = applyUfcDeepProfileLearnedWeights(matchup, weights);

assert.equal(adjusted.modelVersion, "ufc-deep-profile-sim-adjuster-v1");
assert.equal(adjusted.fightId, "fight-adjust-1");
assert.ok(adjusted.confidenceCap < 0.96);
assert.ok(adjusted.adjustedConfidence <= matchup.overallEdge.confidence);
assert.ok(Math.abs(adjusted.adjustedOverallEdge.edge) <= Math.abs(matchup.overallEdge.edge) + 10);
const wrestling = adjusted.adjustedPhaseEdges.find((edge) => edge.phase === "wrestling");
assert.ok(wrestling);
assert.ok(Math.abs(wrestling.edge) < Math.abs(matchup.phaseEdges.wrestling.edge));
assert.ok(adjusted.methodPriors.koTko > 0);
assert.ok(adjusted.methodPriors.decision > 0);
assert.ok(adjusted.methodPriors.koTko + adjusted.methodPriors.submission + adjusted.methodPriors.decision > 0.99);
assert.ok(adjusted.adjustedWinPaths[0].score >= adjusted.adjustedWinPaths[adjusted.adjustedWinPaths.length - 1].score);
assert.ok(adjusted.simDeltas.trustPenalty >= matchup.simModifiers.matchup.trustPenalty);
assert.ok(adjusted.summary.includes("Method priors"));

console.log("ufc-deep-profile-sim-adjuster.test.ts passed");
