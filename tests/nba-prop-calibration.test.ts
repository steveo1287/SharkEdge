import assert from "node:assert/strict";

import {
  lookupNbaPropCalibration,
  nbaPropConfidenceBucket,
  summarizeNbaPropCalibrationBuckets,
  type NbaPropCalibrationRow
} from "@/services/simulation/nba-prop-calibration";

assert.equal(nbaPropConfidenceBucket(0.54), "0.00-0.55");
assert.equal(nbaPropConfidenceBucket(0.7), "0.68-0.74");
assert.equal(nbaPropConfidenceBucket(0.83), "0.80-1.00");

const healthyRows: NbaPropCalibrationRow[] = Array.from({ length: 90 }, (_, index) => ({
  statKey: "points",
  confidence: 0.71,
  predictedOverProbability: index % 2 === 0 ? 0.58 : 0.42,
  marketLine: 24.5,
  actualValue: index % 2 === 0 ? 27 : 22,
  closingLine: index % 2 === 0 ? 25 : 24
}));

const buckets = summarizeNbaPropCalibrationBuckets(healthyRows);
const healthy = lookupNbaPropCalibration({ buckets, statKey: "player_points", confidence: 0.71 });
assert.equal(healthy.status, "HEALTHY");
assert.equal(healthy.bucket?.statKey, "points");
assert.equal(healthy.bucket?.bucket, "0.68-0.74");
assert.equal(healthy.blockerReasons.length, 0);

const insufficient = lookupNbaPropCalibration({
  buckets: summarizeNbaPropCalibrationBuckets(healthyRows.slice(0, 12)),
  statKey: "points",
  confidence: 0.71
});
assert.equal(insufficient.status, "INSUFFICIENT");
assert.ok(insufficient.blockerReasons.some((reason) => reason.includes("30")));

const poorRows: NbaPropCalibrationRow[] = Array.from({ length: 60 }, () => ({
  statKey: "assists",
  confidence: 0.71,
  predictedOverProbability: 0.76,
  marketLine: 6.5,
  actualValue: 4,
  closingLine: 6
}));

const poor = lookupNbaPropCalibration({
  buckets: summarizeNbaPropCalibrationBuckets(poorRows),
  statKey: "assists",
  confidence: 0.71
});
assert.equal(poor.status, "POOR");
assert.ok(poor.blockerReasons.some((reason) => reason.includes("overconfidence") || reason.includes("Brier")));

const unsupported = lookupNbaPropCalibration({ buckets, statKey: "dunks", confidence: 0.71 });
assert.equal(unsupported.status, "INSUFFICIENT");
assert.ok(unsupported.blockerReasons.some((reason) => reason.includes("unsupported")));

const missing = lookupNbaPropCalibration({ buckets, statKey: "rebounds", confidence: 0.71 });
assert.equal(missing.status, "INSUFFICIENT");
assert.ok(missing.blockerReasons.some((reason) => reason.includes("no NBA prop calibration bucket")));

console.log("nba-prop-calibration.test.ts passed");
