import assert from "node:assert/strict";

import { applyMlbCalibration, fitMlbCalibrationFromScoredRows } from "@/services/simulation/mlb-calibration-conformal";

const rows = [
  ...Array.from({ length: 36 }, () => ({
    probability: 0.56,
    actual: 1 as const,
    projectedTotal: 8.4,
    actualTotal: 9
  })),
  ...Array.from({ length: 24 }, () => ({
    probability: 0.56,
    actual: 0 as const,
    projectedTotal: 8.4,
    actualTotal: 7
  })),
  ...Array.from({ length: 20 }, () => ({
    probability: 0.44,
    actual: 0 as const,
    projectedTotal: 8.1,
    actualTotal: 6
  })),
  ...Array.from({ length: 10 }, () => ({
    probability: 0.44,
    actual: 1 as const,
    projectedTotal: 8.1,
    actualTotal: 10
  }))
];

const model = fitMlbCalibrationFromScoredRows({
  rows,
  source: "sim_prediction_snapshots",
  trainedAt: "2026-05-13T00:00:00.000Z"
});

assert.equal(model.ok, true);
assert.equal(model.source, "sim_prediction_snapshots");
assert.equal(model.rows, 90);
assert.ok(model.ece > 0);
assert.ok(model.totalResidualP80 > 0);

const homeBin = model.bins.find((bin) => 0.56 >= bin.min && 0.56 < bin.max);
assert.ok(homeBin);
assert.equal(homeBin.count, 60);
assert.equal(homeBin.observedRate, 0.6);
assert.ok(homeBin.correction > 0);

const calibrated = applyMlbCalibration(model, 0.56);
assert.ok(calibrated.calibratedProbability > 0.56);
assert.ok(calibrated.correction <= 0.032);

const insufficient = fitMlbCalibrationFromScoredRows({
  rows: rows.slice(0, 12),
  source: "sim_prediction_snapshots"
});
assert.equal(insufficient.ok, false);
assert.equal(insufficient.rows, 12);

console.log("mlb-snapshot-calibration.test.ts passed");
