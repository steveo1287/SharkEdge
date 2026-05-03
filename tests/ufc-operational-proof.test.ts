import assert from "node:assert/strict";

import { calculateUfcCalibrationReport } from "@/services/ufc/calibration";
import { calculateUfcEdgePct } from "@/services/ufc/operational-sim";

assert.equal(calculateUfcEdgePct(0.6, -110), 7.62);
assert.equal(calculateUfcEdgePct(0.4, 150), 0);
assert.equal(calculateUfcEdgePct(0.55, null), null);

const report = calculateUfcCalibrationReport([
  { fightId: "f1", modelVersion: "v1", fighterAWinProbability: 0.72, actualWinner: "A", pickSide: "A", marketOddsAOpen: -140, marketOddsAClose: -170 },
  { fightId: "f2", modelVersion: "v1", fighterAWinProbability: 0.61, actualWinner: "B", pickSide: "A", marketOddsAOpen: -120, marketOddsAClose: -105 },
  { fightId: "f3", modelVersion: "v1", fighterAWinProbability: 0.44, actualWinner: "B", pickSide: "B", marketOddsAOpen: 130, marketOddsAClose: 115 },
  { fightId: "f4", modelVersion: "v1", fighterAWinProbability: 0.35, actualWinner: "A", pickSide: "B", marketOddsAOpen: 180, marketOddsAClose: 210 }
]);

assert.equal(report.count, 4);
assert.equal(report.accuracyPct, 50);
assert.ok(report.logLoss > 0);
assert.ok(report.brierScore > 0);
assert.ok(report.calibrationError >= 0);
assert.ok(report.buckets.length >= 3);
assert.notEqual(report.avgClvPct, null);

const empty = calculateUfcCalibrationReport([]);
assert.equal(empty.count, 0);
assert.equal(empty.buckets.length, 0);

console.log("ufc-operational-proof tests passed");
