import assert from "node:assert/strict";

import {
  baseballMarginMultiplier,
  blendProbabilitySignal,
  eloExpectedWinProbability,
  log5FromScoring,
  log5Probability,
  pythagoreanWinPct,
  updateEloRating
} from "@/services/analytics/team-strength/matchup-probability";

const pyth = pythagoreanWinPct({ scored: 500, allowed: 400 });
assert.ok(Math.abs(pyth.expectedWinPct - 0.6007) < 0.0001);
assert.equal(pyth.exponent, 1.83);
assert.equal(pyth.method, "pythagenpat");

const log5 = log5Probability({ teamAWinPct: 0.6, teamBWinPct: 0.5 });
assert.equal(Number(log5.teamAProbability.toFixed(4)), 0.6);
assert.equal(Number(log5.teamBProbability.toFixed(4)), 0.4);

const evenLog5 = log5Probability({ teamAWinPct: 0.5, teamBWinPct: 0.5 });
assert.equal(evenLog5.teamAProbability, 0.5);
assert.equal(evenLog5.teamBProbability, 0.5);

const scoringLog5 = log5FromScoring({
  teamAScored: 500,
  teamAAllowed: 400,
  teamBScored: 420,
  teamBAllowed: 470
});
assert.ok(scoringLog5.teamAExpectedWinPct > 0.6);
assert.ok(scoringLog5.teamBExpectedWinPct < 0.5);
assert.ok(scoringLog5.teamAProbability > scoringLog5.teamAExpectedWinPct);
assert.ok(scoringLog5.teamAProbability > 0.6);

const blended = blendProbabilitySignal({
  baseProbability: 0.52,
  signalProbability: 0.62,
  weight: 0.1
});
assert.equal(Number(blended.adjustedProbability.toFixed(3)), 0.53);
assert.equal(blended.weight, 0.1);

const eloNeutral = eloExpectedWinProbability({ ratingA: 1500, ratingB: 1500 });
assert.equal(eloNeutral.teamAProbability, 0.5);

const eloHome = eloExpectedWinProbability({ ratingA: 1500, ratingB: 1500, teamAIsHome: true });
assert.ok(eloHome.teamAProbability > 0.53);
assert.equal(eloHome.homeFieldElo, 24);

const eloUpdate = updateEloRating({ rating: 1500, expectedScore: 0.6, actualScore: 1, kFactor: 4 });
assert.equal(Number(eloUpdate.ratingDelta.toFixed(2)), 1.6);
assert.equal(Number(eloUpdate.updatedRating.toFixed(2)), 1501.6);

assert.equal(baseballMarginMultiplier(1), 1);
assert.ok(baseballMarginMultiplier(10) > baseballMarginMultiplier(2));
assert.throws(() => pythagoreanWinPct({ scored: -1, allowed: 400 }));
assert.throws(() => log5Probability({ teamAWinPct: Number.NaN, teamBWinPct: 0.5 }));

console.log("matchup-probability tests passed");
