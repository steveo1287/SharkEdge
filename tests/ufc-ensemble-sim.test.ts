import assert from "node:assert/strict";

import { blendUfcSimOutputs, runUfcEnsembleSimFromFeatures } from "@/services/ufc/ensemble-sim";
import type { UfcModelFeatureSnapshot } from "@/services/ufc/fighter-skill-profile";
import type { UfcExchangeMonteCarloResult } from "@/services/ufc/exchange-monte-carlo";
import type { UfcSkillMarkovResult } from "@/services/ufc/skill-markov-sim";

function stripGeneratedAt(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripGeneratedAt);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "generatedAt")
      .map(([key, inner]) => [key, stripGeneratedAt(inner)])
  );
}

const skillMarkov: UfcSkillMarkovResult = {
  simulations: 1_000,
  seed: 11,
  fighterAWinProbability: 0.6,
  fighterBWinProbability: 0.4,
  methodProbabilities: { KO_TKO: 0.2, SUBMISSION: 0.1, DECISION: 0.7 },
  roundFinishProbabilities: { R1: 0.08, R2: 0.06, R3: 0.04 },
  transitionProbabilities: {
    standingToClinchA: 0.12,
    standingToTakedownAttemptA: 0.14,
    takedownSuccessA: 0.45,
    groundControlToSubmissionThreatA: 0.1,
    groundControlToStandupA: 0.35,
    strikingExchangeToKnockdownA: 0.02,
    finishAttemptToKoA: 0.24,
    finishAttemptToSubmissionA: 0.18
  },
  deltas: {
    fighterAId: "a",
    fighterBId: "b",
    strikingEdgeA: 0.1,
    kickingEdgeA: 0.02,
    wrestlingEdgeA: 0.05,
    grapplingEdgeA: 0.02,
    cardioEdgeA: 0.04,
    staminaEdgeA: 0.03,
    durabilityEdgeA: 0.03,
    heartEdgeA: 0.02,
    fightIqEdgeA: 0.02,
    finishEdgeA: 0.08,
    decisionEdgeA: 0.05,
    paceEdgeA: 0.03,
    pressureEdgeA: 0.02,
    distanceEdgeA: 0.02,
    groundControlBiasA: 0.04,
    knockdownBiasA: 0.07,
    submissionBiasA: 0.01,
    submissionDefenseEdgeA: 0.02,
    grapplingDefenseEdgeA: 0.02,
    layoffRiskA: 0,
    upsetRisk: 0.22
  },
  pathSummary: ["Skill Markov gives Fighter A the cleaner pressure lane."]
};

const exchangeMonteCarlo: UfcExchangeMonteCarloResult = {
  simulations: 1_000,
  seed: 28,
  scheduledRounds: 3,
  exchangeSeconds: 5,
  fighterAWinProbability: 0.7,
  fighterBWinProbability: 0.3,
  methodProbabilities: { KO_TKO: 0.32, SUBMISSION: 0.08, DECISION: 0.6 },
  roundFinishProbabilities: { R1: 0.12, R2: 0.08, R3: 0.05 },
  averageFightLengthSeconds: 710,
  averageDamage: { fighterA: 44, fighterB: 78 },
  averageControlSeconds: { fighterA: 72, fighterB: 28 },
  averageKnockdowns: { fighterA: 0.18, fighterB: 0.04 },
  diagnosticProbabilities: {
    fighterAStrikeAttemptPerExchange: 0.21,
    fighterBStrikeAttemptPerExchange: 0.16,
    fighterAStrikeLandGivenAttempt: 0.48,
    fighterBStrikeLandGivenAttempt: 0.37,
    fighterATakedownAttemptPerExchange: 0.02,
    fighterBTakedownAttemptPerExchange: 0.01,
    fighterATakedownSuccessGivenAttempt: 0.44,
    fighterBTakedownSuccessGivenAttempt: 0.31
  }
};

const roundByRound = {
  engine: "round_by_round",
  simulations: 1_000,
  seed: 42,
  scheduledRounds: 3,
  fighterAWinProbability: 0.64,
  fighterBWinProbability: 0.36,
  methodProbabilities: { KO_TKO: 0.28, SUBMISSION: 0.1, DECISION: 0.62 },
  roundFinishProbabilities: { R1: 0.1, R2: 0.07, R3: 0.05 },
  transitionProbabilities: { strikingExchangeToKnockdownA: 0.03 },
  averageFightLengthSeconds: 720,
  averageDamage: { fighterA: 48, fighterB: 72 },
  averageControlSeconds: { fighterA: 70, fighterB: 30 },
  averageKnockdowns: { fighterA: 0.16, fighterB: 0.04 },
  diagnosticProbabilities: {
    paceA: 0.58,
    paceB: 0.44,
    strikingEdgeA: 0.12,
    grapplingEdgeA: 0.08,
    finishPressureA: 0.2,
    finishPressureB: 0.1,
    decisionEdgeA: 0.07
  },
  pathSummary: ["Round engine keeps Fighter A ahead late."],
  dangerFlags: []
} as const;

const styleMatchup = {
  engine: "style_matchup",
  simulations: 1_000,
  seed: 58,
  scheduledRounds: 3,
  fighterAWinProbability: 0.63,
  fighterBWinProbability: 0.37,
  methodProbabilities: { KO_TKO: 0.24, SUBMISSION: 0.12, DECISION: 0.64 },
  roundFinishProbabilities: { R1: 0.08, R2: 0.06, R3: 0.04 },
  transitionProbabilities: { pressure_exchange: 0.22 },
  style: {
    fighterA: "PRESSURE_STRIKER",
    fighterB: "BALANCED_MMA",
    fighterAScores: {},
    fighterBScores: {},
    matchupLevers: {}
  },
  pathWins: { pressure_exchange: 0.4 },
  pathSummary: ["Style matchup favors Fighter A pressure."],
  dangerFlags: []
} as any;

const blended = blendUfcSimOutputs({
  skillMarkov,
  exchangeMonteCarlo,
  roundByRound: roundByRound as any,
  styleMatchup,
  weights: { skillMarkov: 0.5, exchangeMonteCarlo: 0.5, roundByRound: 0, styleMatchup: 0 }
});
assert.equal(blended.engine, "ensemble");
assert.equal(blended.fighterAWinProbability, 0.65);
assert.equal(blended.fighterBWinProbability, 0.35);
assert.equal(Number((blended.fighterAWinProbability + blended.fighterBWinProbability).toFixed(4)), 1);
assert.equal(Number(Object.values(blended.methodProbabilities).reduce((sum, value) => sum + value, 0).toFixed(2)), 1);
assert.equal(blended.methodProbabilities.KO_TKO, 0.26);
assert.equal(blended.roundFinishProbabilities.R1, 0.1);
assert.ok(blended.pathSummary.some((line) => line.includes("knockdown")));
assert.ok(Array.isArray(blended.dangerFlags));

const fighterAFeature: UfcModelFeatureSnapshot = {
  fightId: "fight-1",
  fightDate: "2026-06-01T00:00:00.000Z",
  fighterId: "a",
  opponentFighterId: "b",
  snapshotAt: "2026-05-31T00:00:00.000Z",
  modelVersion: "v1",
  proFights: 18,
  ufcFights: 6,
  roundsFought: 24,
  sigStrikesLandedPerMin: 5.4,
  sigStrikesAbsorbedPerMin: 2.7,
  strikingDifferential: 2.1,
  sigStrikeAccuracyPct: 52,
  sigStrikeDefensePct: 62,
  knockdownsPer15: 1.1,
  takedownsPer15: 1.4,
  takedownAccuracyPct: 42,
  takedownDefensePct: 76,
  submissionAttemptsPer15: 0.3,
  controlTimePct: 16,
  finishRate: 0.78,
  lateRoundPerformance: 64,
  opponentAdjustedStrength: 63
};

const fighterBFeature: UfcModelFeatureSnapshot = {
  ...fighterAFeature,
  fighterId: "b",
  opponentFighterId: "a",
  sigStrikesLandedPerMin: 3.1,
  sigStrikesAbsorbedPerMin: 4.9,
  strikingDifferential: -1.1,
  sigStrikeAccuracyPct: 41,
  sigStrikeDefensePct: 43,
  knockdownsPer15: 0.1,
  takedownsPer15: 0.8,
  takedownAccuracyPct: 31,
  takedownDefensePct: 49,
  submissionAttemptsPer15: 0.2,
  controlTimePct: 8,
  finishRate: 0.35,
  lateRoundPerformance: 42,
  opponentAdjustedStrength: 48
};

const featureRun = runUfcEnsembleSimFromFeatures(fighterAFeature, fighterBFeature, { simulations: 1_000, seed: 99, scheduledRounds: 3 });
const featureRunAgain = runUfcEnsembleSimFromFeatures(fighterAFeature, fighterBFeature, { simulations: 1_000, seed: 99, scheduledRounds: 3 });
assert.deepEqual(stripGeneratedAt(featureRun), stripGeneratedAt(featureRunAgain));
assert.equal(Number((featureRun.fighterAWinProbability + featureRun.fighterBWinProbability).toFixed(4)), 1);
assert.ok(featureRun.fighterAWinProbability > 0.5);
assert.ok(featureRun.averageDamage.fighterB > featureRun.averageDamage.fighterA);
assert.ok(featureRun.exchangeDiagnostics.fighterAStrikeLandGivenAttempt > featureRun.exchangeDiagnostics.fighterBStrikeLandGivenAttempt);

console.log("ufc-ensemble-sim tests passed");
