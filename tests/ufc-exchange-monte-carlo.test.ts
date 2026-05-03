import assert from "node:assert/strict";

import {
  blendedLandProbability,
  blendedTakedownSuccessProbability,
  buildExchangeStatsFromUfcFeature,
  runUfcExchangeMonteCarlo,
  type UfcExchangeFighterStats
} from "@/services/ufc/exchange-monte-carlo";

const striker: UfcExchangeFighterStats = {
  fighterId: "striker",
  slpm: 5.8,
  sapm: 2.8,
  strikeAccuracyPct: 53,
  strikeDefensePct: 61,
  knockdownsPer15: 1.5,
  takedownsPer15: 0.3,
  takedownAccuracyPct: 22,
  takedownDefensePct: 78,
  submissionAttemptsPer15: 0.1,
  controlTimePct: 5,
  finishRate: 0.82,
  durability: 72,
  cardio: 62,
  opponentAdjustedStrength: 64
};

const fragile: UfcExchangeFighterStats = {
  fighterId: "fragile",
  slpm: 3.1,
  sapm: 5.4,
  strikeAccuracyPct: 41,
  strikeDefensePct: 41,
  knockdownsPer15: 0.15,
  takedownsPer15: 0.4,
  takedownAccuracyPct: 25,
  takedownDefensePct: 51,
  submissionAttemptsPer15: 0.2,
  controlTimePct: 7,
  finishRate: 0.38,
  koLossRate: 0.25,
  durability: 38,
  cardio: 43,
  opponentAdjustedStrength: 48
};

const wrestler: UfcExchangeFighterStats = {
  fighterId: "wrestler",
  slpm: 3.2,
  sapm: 2.6,
  strikeAccuracyPct: 43,
  strikeDefensePct: 58,
  knockdownsPer15: 0.2,
  takedownsPer15: 4.7,
  takedownAccuracyPct: 55,
  takedownDefensePct: 82,
  submissionAttemptsPer15: 1.2,
  controlTimePct: 48,
  finishRate: 0.62,
  durability: 70,
  cardio: 68,
  opponentAdjustedStrength: 63
};

assert.equal(blendedLandProbability(50, 60), 0.45);
assert.equal(blendedTakedownSuccessProbability(50, 70), 0.4);

const sim = runUfcExchangeMonteCarlo(striker, fragile, { simulations: 1_000, seed: 1287, exchangeSeconds: 5 });
const simAgain = runUfcExchangeMonteCarlo(striker, fragile, { simulations: 1_000, seed: 1287, exchangeSeconds: 5 });
assert.deepEqual(sim, simAgain);
assert.equal(Number((sim.fighterAWinProbability + sim.fighterBWinProbability).toFixed(4)), 1);
assert.equal(Number(Object.values(sim.methodProbabilities).reduce((sum, value) => sum + value, 0).toFixed(2)), 1);
assert.ok(sim.fighterAWinProbability > 0.5);
assert.ok(sim.averageDamage.fighterB > sim.averageDamage.fighterA);
assert.ok(sim.averageKnockdowns.fighterA > sim.averageKnockdowns.fighterB);

const wrestlingSim = runUfcExchangeMonteCarlo(wrestler, fragile, { simulations: 1_000, seed: 42, exchangeSeconds: 5 });
assert.ok(wrestlingSim.averageControlSeconds.fighterA > sim.averageControlSeconds.fighterA);
assert.ok(wrestlingSim.diagnosticProbabilities.fighterATakedownAttemptPerExchange > sim.diagnosticProbabilities.fighterATakedownAttemptPerExchange);

const featureStats = buildExchangeStatsFromUfcFeature({
  fightId: "fight-1",
  fightDate: "2026-06-01T00:00:00.000Z",
  fighterId: "feature-fighter",
  opponentFighterId: "opponent",
  snapshotAt: "2026-05-31T00:00:00.000Z",
  modelVersion: "v1",
  sigStrikesLandedPerMin: 4,
  sigStrikesAbsorbedPerMin: 3,
  sigStrikeAccuracyPct: 47,
  sigStrikeDefensePct: 59,
  knockdownsPer15: 0.5,
  takedownsPer15: 2,
  takedownAccuracyPct: 42,
  takedownDefensePct: 70,
  submissionAttemptsPer15: 0.7,
  controlTimePct: 22,
  finishRate: 0.6,
  lateRoundPerformance: 61,
  opponentAdjustedStrength: 57
});
assert.equal(featureStats.fighterId, "feature-fighter");
assert.equal(featureStats.slpm, 4);
assert.equal(featureStats.takedownDefensePct, 70);

console.log("ufc-exchange-monte-carlo tests passed");
