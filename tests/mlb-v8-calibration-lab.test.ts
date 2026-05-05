import assert from "node:assert/strict";

import { summarizeMlbCalibrationRows } from "@/services/simulation/mlb-v8-calibration-lab";

const rows = [
  {
    id: "1",
    source: "official" as const,
    result: "WIN" as const,
    raw_probability: 0.55,
    calibrated_probability: 0.6,
    market_no_vig_probability: 0.54,
    edge: 0.06,
    brier: null,
    log_loss: null,
    clv: 2.1,
    roi: 1,
    prediction_json: null
  },
  {
    id: "2",
    source: "official" as const,
    result: "LOSS" as const,
    raw_probability: 0.57,
    calibrated_probability: 0.62,
    market_no_vig_probability: 0.55,
    edge: 0.07,
    brier: null,
    log_loss: null,
    clv: -1,
    roi: -1,
    prediction_json: null
  }
];

const summary = summarizeMlbCalibrationRows(rows);
assert.equal(summary.count, 2);
assert.equal(summary.wins, 1);
assert.equal(summary.losses, 1);
assert.equal(summary.winRate, 0.5);
assert.equal(summary.avgProbability, 0.61);
assert.ok(summary.brier !== null && summary.brier > 0);
assert.ok(summary.logLoss !== null && summary.logLoss > 0);
assert.ok(summary.marketBrier !== null && summary.marketBrier > 0);
assert.ok(summary.marketLogLoss !== null && summary.marketLogLoss > 0);
assert.equal(summary.avgEdge, 0.065);
assert.equal(summary.avgClv, 0.55);
assert.equal(summary.roi, 0);

const empty = summarizeMlbCalibrationRows([]);
assert.equal(empty.count, 0);
assert.equal(empty.winRate, null);
assert.equal(empty.brier, null);

console.log("mlb-v8-calibration-lab.test.ts passed");
