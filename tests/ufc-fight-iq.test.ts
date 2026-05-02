import assert from "node:assert/strict";

import {
  americanOddsToImpliedProbability,
  buildUfcFightIqPrediction,
  probabilityToAmericanOdds
} from "@/services/ufc/fight-iq";
import {
  assertNoFutureFeatureLeakage,
  assertWalkForwardOnly,
  buildUfcWalkForwardSplits,
  type UfcHistoricalFightRow
} from "@/services/ufc/fight-iq-backtest";

assert.equal(americanOddsToImpliedProbability(100), 0.5);
assert.equal(americanOddsToImpliedProbability(150), 0.4);
assert.equal(americanOddsToImpliedProbability(-200), 0.666667);
assert.equal(americanOddsToImpliedProbability(0), null);
assert.equal(probabilityToAmericanOdds(0.5), -100);
assert.equal(probabilityToAmericanOdds(0.6666667), -200);
assert.equal(probabilityToAmericanOdds(0.4), 150);

const baseInput = {
  fightId: "ufc-test-1",
  eventLabel: "Test Fighter A vs Test Fighter B",
  scheduledRounds: 3 as const,
  market: {
    fighterAOddsAmerican: -120,
    fighterBOddsAmerican: 110
  },
  fighterA: {
    id: "fighter-a",
    name: "Test Fighter A",
    age: 29,
    reachInches: 74,
    elo: 1580,
    proWins: 14,
    proLosses: 3,
    proFights: 17,
    ufcFights: 7,
    roundsFought: 28,
    opponentStrengthScore: 67,
    promotionTier: "MAJOR" as const,
    stats: {
      sigStrikesLandedPerMin: 4.8,
      sigStrikesAbsorbedPerMin: 3.1,
      strikingDifferential: 1.7,
      sigStrikeAccuracyPct: 49,
      sigStrikeDefensePct: 58,
      knockdownsPer15: 0.45,
      takedownsPer15: 1.9,
      takedownAccuracyPct: 41,
      takedownDefensePct: 71,
      submissionAttemptsPer15: 0.6,
      controlTimePct: 29,
      getUpScore: 0.6
    },
    recent: {
      last3Wins: 2,
      last5Wins: 4,
      finishWinsLast5: 2,
      finishLossesLast5: 0,
      round3WinRatePct: 62,
      cardioScore: 0.7,
      damageAbsorbedTrend: -0.2
    }
  },
  fighterB: {
    id: "fighter-b",
    name: "Test Fighter B",
    age: 33,
    reachInches: 71,
    elo: 1505,
    proWins: 12,
    proLosses: 5,
    proFights: 17,
    ufcFights: 6,
    roundsFought: 24,
    opponentStrengthScore: 55,
    promotionTier: "REGIONAL_PLUS" as const,
    stats: {
      sigStrikesLandedPerMin: 3.2,
      sigStrikesAbsorbedPerMin: 3.8,
      strikingDifferential: -0.6,
      sigStrikeAccuracyPct: 43,
      sigStrikeDefensePct: 51,
      knockdownsPer15: 0.2,
      takedownsPer15: 1.1,
      takedownAccuracyPct: 34,
      takedownDefensePct: 59,
      submissionAttemptsPer15: 0.3,
      controlTimePct: 16,
      getUpScore: 0.2
    },
    recent: {
      last3Wins: 1,
      last5Wins: 2,
      finishWinsLast5: 1,
      finishLossesLast5: 1,
      round3WinRatePct: 43,
      cardioScore: -0.1,
      damageAbsorbedTrend: 0.3
    }
  }
};

const predictionA = buildUfcFightIqPrediction(baseInput, { simulations: 2_500, seed: 42 });
const predictionB = buildUfcFightIqPrediction(baseInput, { simulations: 2_500, seed: 42 });

assert.deepEqual(predictionA.modelBreakdown, predictionB.modelBreakdown, "seeded simulation should be deterministic");
assert.equal(predictionA.pick.fighterId, "fighter-a");
assert.ok(predictionA.pick.winProbability > 0.5);
assert.ok(predictionA.simulations === 2_500);
assert.ok(predictionA.pathToVictory.length > 0);

const fighterProbSum = Number((predictionA.fighters.fighterA.winProbability + predictionA.fighters.fighterB.winProbability).toFixed(4));
assert.equal(fighterProbSum, 1);

const methodSum = Number(Object.values(predictionA.methodProbabilities).reduce((sum, value) => sum + value, 0).toFixed(2));
assert.equal(methodSum, 1);

const lowSamplePrediction = buildUfcFightIqPrediction({
  ...baseInput,
  fightId: "ufc-low-sample",
  fighterA: {
    ...baseInput.fighterA,
    id: "prospect-a",
    name: "Prospect A",
    elo: 1725,
    proFights: 4,
    ufcFights: 0,
    roundsFought: 0,
    amateurWins: 8,
    amateurLosses: 1,
    promotionTier: "REGIONAL_PLUS" as const
  }
}, { simulations: 2_500, seed: 1287 });

assert.equal(lowSamplePrediction.fighters.fighterA.coldStart.active, true);
assert.ok(lowSamplePrediction.fighters.fighterA.winProbability <= 0.58, "0 UFC fight prospect confidence must be probability-capped");
assert.equal(lowSamplePrediction.pick.confidenceGrade, "LOW");
assert.ok(lowSamplePrediction.dangerFlags.some((flag) => flag.includes("No UFC sample")));

const rows: UfcHistoricalFightRow[] = Array.from({ length: 8 }, (_, index) => {
  const day = String(index + 1).padStart(2, "0");
  return {
    fightId: `fight-${index + 1}`,
    fightDate: `2024-01-${day}T23:00:00.000Z`,
    featureSnapshotAt: `2024-01-${day}T20:00:00.000Z`,
    fighterAId: `a-${index + 1}`,
    fighterBId: `b-${index + 1}`,
    winnerId: `a-${index + 1}`
  };
});

assert.equal(assertNoFutureFeatureLeakage(rows), true);
const splits = buildUfcWalkForwardSplits(rows, { minTrainSize: 4, testSize: 2 });
assert.equal(splits.length, 2);
assert.equal(assertWalkForwardOnly(splits, rows), true);
assert.deepEqual(splits[0].trainFightIds, ["fight-1", "fight-2", "fight-3", "fight-4"]);
assert.deepEqual(splits[0].testFightIds, ["fight-5", "fight-6"]);

assert.throws(() => assertNoFutureFeatureLeakage([
  {
    fightId: "bad-leak",
    fightDate: "2024-01-01T23:00:00.000Z",
    featureSnapshotAt: "2024-01-02T00:00:00.000Z",
    fighterAId: "a",
    fighterBId: "b"
  }
]), /future-data leakage/);

console.log("ufc-fight-iq tests passed");
