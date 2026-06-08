import assert from "node:assert/strict";

import { buildUfcDeepProfileCalibrationReport } from "@/services/ufc/deep-profile-calibration";
import type { UfcDeepProfileMatchup } from "@/services/ufc/deep-profile-matchup-engine";

const matchup: UfcDeepProfileMatchup = {
  modelVersion: "ufc-deep-profile-matchup-engine-v1",
  generatedAt: "2026-06-08T12:00:00.000Z",
  fightId: "fight-cal-1",
  fighterA: { fighterId: "a", fighterName: "Chain Wrestler", archetype: "CHAIN_WRESTLER", overall: 76, confidence: 0.82 },
  fighterB: { fighterId: "b", fighterName: "Power Striker", archetype: "POWER_PUNCHER", overall: 70, confidence: 0.78 },
  overallEdge: { leader: "A", edge: 9.5, confidence: 0.84, summary: "Chain Wrestler leads the deep-profile matchup by 9.5." },
  phaseEdges: {
    standing: { phase: "standing", fighterA: 61, fighterB: 77, edge: -16, leader: "B", confidence: 0.78, drivers: ["power_vs_defense"], summary: "standing: Power Striker leads by 16.0." },
    clinch: { phase: "clinch", fighterA: 70, fighterB: 58, edge: 12, leader: "A", confidence: 0.8, drivers: ["clinch_control"], summary: "clinch: Chain Wrestler leads by 12.0." },
    wrestling: { phase: "wrestling", fighterA: 83, fighterB: 48, edge: 35, leader: "A", confidence: 0.82, drivers: ["chain_wrestling"], summary: "wrestling: Chain Wrestler leads by 35.0." },
    grappling: { phase: "grappling", fighterA: 78, fighterB: 50, edge: 28, leader: "A", confidence: 0.81, drivers: ["top_control"], summary: "grappling: Chain Wrestler leads by 28.0." },
    cardio: { phase: "cardio", fighterA: 73, fighterB: 58, edge: 15, leader: "A", confidence: 0.76, drivers: ["late_pace"], summary: "cardio: Chain Wrestler leads by 15.0." },
    durability: { phase: "durability", fighterA: 67, fighterB: 54, edge: 13, leader: "A", confidence: 0.74, drivers: ["durability"], summary: "durability: Chain Wrestler leads by 13.0." },
    finish: { phase: "finish", fighterA: 72, fighterB: 79, edge: -7, leader: "B", confidence: 0.77, drivers: ["early_power"], summary: "finish: Power Striker leads by 7.0." },
    decision: { phase: "decision", fighterA: 80, fighterB: 61, edge: 19, leader: "A", confidence: 0.8, drivers: ["decision_control"], summary: "decision: Chain Wrestler leads by 19.0." }
  },
  topPhaseEdges: [],
  dangerZones: [
    { type: "TAKEDOWN_CHAIN", target: "B", severity: 84, confidence: 0.82, drivers: ["chain_wrestling_gap"], summary: "Power Striker can be put into takedown chains." },
    { type: "EARLY_POWER", target: "A", severity: 64, confidence: 0.78, drivers: ["power_vs_defense"], summary: "Chain Wrestler has early power exposure." }
  ],
  winConditionPaths: [
    { fighter: "A", fighterId: "a", fighterName: "Chain Wrestler", condition: "DECISION_CONTROL", score: 86, confidence: 0.82, phaseLink: "wrestling", drivers: ["control"], summary: "Chain Wrestler control decision path grades 86." },
    { fighter: "B", fighterId: "b", fighterName: "Power Striker", condition: "KO_TKO", score: 74, confidence: 0.78, phaseLink: "finish", drivers: ["power"], summary: "Power Striker KO/TKO path grades 74." }
  ],
  roundLeverage: [
    { round: 1, leverage: "B_FAST_START", fighterA: 62, fighterB: 78, volatility: 66, drivers: ["early_phase"], summary: "Round 1: Power Striker projects +16." },
    { round: 2, leverage: "A_FAST_START", fighterA: 72, fighterB: 61, volatility: 58, drivers: ["control"], summary: "Round 2: Chain Wrestler projects +11." },
    { round: 3, leverage: "A_LATE_EDGE", fighterA: 78, fighterB: 56, volatility: 51, drivers: ["late_phase"], summary: "Round 3: Chain Wrestler projects +22." },
    { round: 4, leverage: "A_LATE_EDGE", fighterA: 76, fighterB: 54, volatility: 50, drivers: ["late_phase"], summary: "Round 4: Chain Wrestler projects +22." },
    { round: 5, leverage: "A_LATE_EDGE", fighterA: 75, fighterB: 52, volatility: 50, drivers: ["late_phase"], summary: "Round 5: Chain Wrestler projects +23." }
  ],
  simModifiers: { fighterA: {}, fighterB: {}, matchup: { volatility: 0.62, trustPenalty: 0.12 } },
  warnings: [],
  summary: "Chain Wrestler owns the top profile edge."
};
matchup.topPhaseEdges = Object.values(matchup.phaseEdges).sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge)).slice(0, 5);

const report = buildUfcDeepProfileCalibrationReport({
  matchup,
  actual: {
    fightId: "fight-cal-1",
    winner: "B",
    method: "KO_TKO",
    round: 1,
    time: "2:14",
    scheduledRounds: 3,
    observedPhases: { standing: "B", wrestling: "B", grappling: "EVEN" },
    triggeredDangerZones: ["EARLY_POWER"],
    notes: ["early knockdown led to finish"]
  },
  generatedAt: "2026-06-09T00:00:00.000Z"
});

assert.equal(report.modelVersion, "ufc-deep-profile-calibration-v1");
assert.equal(report.fightId, "fight-cal-1");
assert.equal(report.correct.winner, false);
assert.equal(report.correct.methodFamily, false);
assert.equal(report.correct.roundBand, true);
assert.equal(report.correct.dangerZone, true);
assert.ok(report.scores.calibrationError > 20);
assert.ok(report.scores.winnerError > 0);
assert.ok(report.scores.methodError > 0);
assert.ok(report.scores.phaseError > 0);
assert.ok(report.scores.confidencePenalty > 0);
assert.ok(report.signals.some((signal) => signal.key === "winner"));
assert.ok(report.signals.some((signal) => signal.key === "method"));
assert.ok(report.signals.some((signal) => signal.key.startsWith("phase:")));
assert.ok(report.adjustments.some((adjustment) => adjustment.type === "PROFILE_RATING_WEIGHT"));
assert.ok(report.adjustments.some((adjustment) => adjustment.type === "METHOD_PRIOR"));
assert.ok(report.adjustments.some((adjustment) => adjustment.type === "CONFIDENCE_CAP"));
assert.ok(report.summary.includes("calibration miss"));

const aligned = buildUfcDeepProfileCalibrationReport({
  matchup,
  actual: { fightId: "fight-cal-1", winner: "A", method: "DECISION", round: 3, scheduledRounds: 3, observedPhases: { wrestling: "A", grappling: "A" }, triggeredDangerZones: ["TAKEDOWN_CHAIN"] },
  generatedAt: "2026-06-09T00:00:00.000Z"
});
assert.equal(aligned.correct.winner, true);
assert.equal(aligned.correct.methodFamily, true);
assert.ok(aligned.scores.calibrationError < report.scores.calibrationError);

console.log("ufc-deep-profile-calibration.test.ts passed");
