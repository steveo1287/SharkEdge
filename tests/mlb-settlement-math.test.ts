import assert from "node:assert/strict";

import { calibrationBucket, computeMlbSnapshotSettlementMath, probabilityBrier, probabilityLogLoss } from "@/services/simulation/mlb-settlement-math";

const homeWin = computeMlbSnapshotSettlementMath({
  homeWinProbability: 0.62,
  modelSpread: 1.5,
  modelTotal: 8.5,
  finalHomeScore: 5,
  finalAwayScore: 3
});

assert.equal(homeWin.homeWon, true);
assert.equal(homeWin.finalMargin, 2);
assert.equal(homeWin.finalTotal, 8);
assert.equal(homeWin.calibrationBucket, "60_65");
assert.equal(homeWin.spreadError, 0.5);
assert.equal(homeWin.totalError, 0.5);
assert.equal(homeWin.brier, Number(probabilityBrier(0.62, 1).toFixed(6)));
assert.equal(homeWin.logLoss, Number(probabilityLogLoss(0.62, 1).toFixed(6)));

const awayWin = computeMlbSnapshotSettlementMath({
  homeWinProbability: 0.58,
  modelSpread: -0.5,
  modelTotal: 7,
  finalHomeScore: 2,
  finalAwayScore: 4
});

assert.equal(awayWin.homeWon, false);
assert.equal(awayWin.finalMargin, -2);
assert.equal(awayWin.finalTotal, 6);
assert.equal(awayWin.brier, Number(probabilityBrier(0.58, 0).toFixed(6)));
assert.equal(awayWin.logLoss, Number(probabilityLogLoss(0.58, 0).toFixed(6)));
assert.equal(calibrationBucket(0.701), "70_plus");

console.log("mlb-settlement-math.test.ts passed");
