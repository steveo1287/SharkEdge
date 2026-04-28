import assert from "node:assert/strict";

import {
  americanToImpliedProbability,
  applyLogitTemperature,
  normalCdf,
  removeTwoWayVig
} from "@/services/simulation/probability-math";
import { calibrateWinProbability, resetCalibrationProfileOverrides, setCalibrationProfileOverrides } from "@/services/simulation/sim-calibration";

assert.equal(Number(americanToImpliedProbability(-150)?.toFixed(4)), 0.6);
assert.equal(Number(americanToImpliedProbability(150)?.toFixed(4)), 0.4);

const noVig = removeTwoWayVig(-110, -110);
assert.ok(noVig);
if (!noVig) {
  throw new Error("expected no-vig result");
}
assert.equal(Number(noVig.left.toFixed(4)), 0.5);
assert.equal(Number(noVig.right.toFixed(4)), 0.5);
assert.equal(Number(noVig.hold.toFixed(4)), 0.0476);

assert.equal(Number(normalCdf(0).toFixed(4)), 0.5);
assert.ok(Math.abs(normalCdf(1) - 0.8413) < 0.0001);

assert.equal(applyLogitTemperature(0.75, 1) > 0.749 && applyLogitTemperature(0.75, 1) < 0.751, true);
assert.equal(applyLogitTemperature(0.75, 1.4) < 0.75, true);
assert.equal(applyLogitTemperature(0.25, 1.4) > 0.25, true);

setCalibrationProfileOverrides({
  TEST: {
    neutralShrink: 0,
    marketBlend: 0,
    moneylineTemperature: 1.4,
    spreadDeltaShrink: 1,
    totalDeltaShrink: 1,
    propProbShrink: 0,
    stdBaseline: 10
  }
});

const calibrated = calibrateWinProbability({
  leagueKey: "TEST",
  rawProb: 0.8,
  totalStdDev: 10
});
assert.ok(calibrated < 0.8);
assert.ok(calibrated > 0.65);

resetCalibrationProfileOverrides();

console.log("probability-math tests passed");
