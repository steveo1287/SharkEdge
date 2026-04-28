import assert from "node:assert/strict";

import {
  americanToImpliedProbability,
  applyLogitTemperature,
  inverseNormalCdf,
  normalCdf,
  removeTwoWayVig
} from "@/services/simulation/probability-math";
import { calibrateWinProbability, resetCalibrationProfileOverrides, setCalibrationProfileOverrides } from "@/services/simulation/sim-calibration";
import { calibratePropProjectionToMarket } from "@/services/simulation/prop-market-calibration";

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
assert.ok(Math.abs(inverseNormalCdf(0.5)) < 0.0001);
assert.ok(Math.abs(inverseNormalCdf(0.8413447) - 1) < 0.0002);

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

const propCalibration = calibratePropProjectionToMarket({
  modelMean: 24,
  modelStdDev: 5,
  marketLine: 20.5,
  overOddsAmerican: -110,
  underOddsAmerican: -110,
  roleConfidence: 0.25,
  sampleSize: 3,
  minutesSampleSize: 3
});
assert.equal(Number(propCalibration.marketNoVigOverProbability?.toFixed(4)), 0.5);
assert.equal(Number(propCalibration.marketImpliedMean?.toFixed(4)), 20.5);
assert.ok(propCalibration.marketBlendWeight > 0.4);
assert.ok(propCalibration.adjustedMean < 24);
assert.ok(propCalibration.adjustedMean > 20.5);
assert.ok(propCalibration.adjustedStdDev >= 5);

const confidentPropCalibration = calibratePropProjectionToMarket({
  modelMean: 24,
  modelStdDev: 5,
  marketLine: 20.5,
  overOddsAmerican: -110,
  underOddsAmerican: -110,
  roleConfidence: 0.9,
  sampleSize: 12,
  minutesSampleSize: 10
});
assert.ok(confidentPropCalibration.marketBlendWeight < propCalibration.marketBlendWeight);
assert.ok(confidentPropCalibration.adjustedMean > propCalibration.adjustedMean);

console.log("probability-math tests passed");
