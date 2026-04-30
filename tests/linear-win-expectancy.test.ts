import assert from "node:assert/strict";

import {
  buildLinearWinExpectancyLabels,
  linearExpectedWinPct,
  linearWinExpectancyProfile,
  linearWinPriorProbability,
  safeLinearExpectedWinPct,
  winPctDelta
} from "@/services/analytics/team-strength/linear-win-expectancy";

const mlb = linearExpectedWinPct({ league: "MLB", scored: 780, allowed: 700 });
assert.equal(mlb.differential, 80);
assert.equal(mlb.coefficient, 0.000683);
assert.equal(Number(mlb.expectedWinPct.toFixed(5)), 0.55464);

const nfl = linearExpectedWinPct({ league: "NFL", scored: 430, allowed: 370 });
assert.equal(nfl.differential, 60);
assert.equal(nfl.coefficient, 0.001538);
assert.equal(Number(nfl.expectedWinPct.toFixed(5)), 0.59228);

const nba = linearExpectedWinPct({ league: "NBA", scored: 9100, allowed: 8800 });
assert.equal(nba.differential, 300);
assert.equal(nba.coefficient, 0.000351);
assert.equal(Number(nba.expectedWinPct.toFixed(5)), 0.6053);

const clampedHigh = linearExpectedWinPct({ league: "NFL", scored: 900, allowed: 100 });
assert.equal(clampedHigh.expectedWinPct, 0.99);
assert.ok(clampedHigh.rawExpectedWinPct > 0.99);

const clampedLow = linearExpectedWinPct({ league: "NBA", scored: 7000, allowed: 11000 });
assert.equal(clampedLow.expectedWinPct, 0.01);
assert.ok(clampedLow.rawExpectedWinPct < 0.01);

assert.equal(safeLinearExpectedWinPct({ league: "NHL", scored: 260, allowed: 240 }), null);
assert.throws(() => linearExpectedWinPct({ league: "MLB", scored: Number.NaN, allowed: 700 }));

const overperforming = winPctDelta({ actualWins: 60, actualLosses: 30, expectedWinPct: 0.55 });
assert.equal(overperforming.status, "OVERPERFORMING");
assert.equal(Number(overperforming.actualWinPct?.toFixed(4)), 0.6667);
assert.equal(Number(overperforming.delta?.toFixed(4)), 0.1167);

const underperforming = winPctDelta({ actualWins: 35, actualLosses: 45, expectedWinPct: 0.55 });
assert.equal(underperforming.status, "UNDERPERFORMING");
assert.equal(Number(underperforming.delta?.toFixed(4)), -0.1125);

const neutral = winPctDelta({ actualWins: 42, actualLosses: 38, expectedWinPct: 0.5 });
assert.equal(neutral.status, "NEUTRAL");

const noSample = winPctDelta({ actualWins: 0, actualLosses: 0, expectedWinPct: 0.5 });
assert.equal(noSample.status, "NO_SAMPLE");
assert.equal(noSample.actualWinPct, null);
assert.equal(noSample.delta, null);

const labels = buildLinearWinExpectancyLabels(80, "OVERPERFORMING");
assert.deepEqual(labels, [
  "Positive Differential Team",
  "Overperforming Record",
  "Regression Candidate",
  "Record/Scoring Mismatch"
]);

const profile = linearWinExpectancyProfile({
  league: "MLB",
  scored: 780,
  allowed: 700,
  actualWins: 60,
  actualLosses: 30
});
assert.equal(profile.status, "OVERPERFORMING");
assert.ok(profile.labels.includes("Regression Candidate"));
assert.ok(profile.delta && profile.delta > 0.1);

const prior = linearWinPriorProbability({
  homeExpectedWinPct: 0.6,
  awayExpectedWinPct: 0.45,
  baseHomeWinProbability: 0.52,
  weight: 0.12
});
assert.equal(prior.weight, 0.12);
assert.ok(prior.linearHomeSignal > 0.57);
assert.ok(prior.adjustedHomeWinProbability > 0.52);
assert.ok(prior.adjustedHomeWinProbability < 0.54);

console.log("linear-win-expectancy tests passed");
