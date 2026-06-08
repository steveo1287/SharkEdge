import assert from "node:assert/strict";

import { buildMlbBatterPropProbabilityCalibration, applyMlbBatterPropProbabilityCalibration, type MlbSettledBatterPropProbabilityRow } from "@/services/simulation/mlb-batter-prop-probability-calibration";
import type { MlbPropSurfaceOutcome } from "@/services/simulation/mlb-batter-prop-surface";

const rows: MlbSettledBatterPropProbabilityRow[] = [];
for (let index = 0; index < 30; index += 1) {
  rows.push({
    market: "HITS",
    line: 0.5,
    side: "OVER",
    modelProbability: 0.64 + (index % 3) * 0.01,
    won: index < 24,
    confidence: 0.72,
    settledAt: "2026-06-01T23:00:00Z"
  });
}
for (let index = 0; index < 20; index += 1) {
  rows.push({
    market: "TOTAL_BASES",
    line: 1.5,
    side: "OVER",
    modelProbability: 0.42 + (index % 2) * 0.02,
    won: index < 7,
    confidence: 0.62,
    settledAt: "2026-06-02T23:00:00Z"
  });
}
rows.push({ market: "HITS", line: 0.5, side: "OVER", modelProbability: Number.NaN, won: true });

const calibration = buildMlbBatterPropProbabilityCalibration({ rows, minBinSample: 20 });
assert.equal(calibration.modelVersion, "mlb-batter-probability-calibration-v1");
assert.equal(calibration.sampleSize, 50);
assert.ok(calibration.brierScore > 0);
assert.ok(calibration.logLoss > 0);
assert.ok(calibration.bins.length >= 2);
assert.ok(calibration.warnings.some((warning) => warning.includes("rejected")));

const hitsBin = calibration.bins.find((bin) => bin.market === "HITS" && bin.line === 0.5 && bin.side === "OVER");
assert.ok(hitsBin);
assert.ok(hitsBin!.sampleSize >= 20);
assert.ok(hitsBin!.observedRate > hitsBin!.averagePredicted);
assert.ok(hitsBin!.probabilityOffset > 0);
assert.ok(hitsBin!.reliability >= 1);

const outcome: MlbPropSurfaceOutcome = {
  market: "HITS",
  line: 0.5,
  side: "OVER",
  probability: 0.65,
  fairAmerican: -186,
  confidence: 0.72
};

const adjusted = applyMlbBatterPropProbabilityCalibration({ outcome, calibration });
assert.equal(adjusted.calibrationApplied, true);
assert.ok(adjusted.calibrationSampleSize >= 20);
assert.ok(adjusted.probability > outcome.probability);
assert.ok(adjusted.rawProbability === outcome.probability);
assert.ok(Number.isFinite(adjusted.fairAmerican));
assert.ok(adjusted.reasons === undefined);

const uncalibrated = applyMlbBatterPropProbabilityCalibration({ outcome, calibration: null });
assert.equal(uncalibrated.calibrationApplied, false);
assert.equal(uncalibrated.probability, outcome.probability);

const empty = buildMlbBatterPropProbabilityCalibration({ rows: [] });
assert.equal(empty.sampleSize, 0);
assert.ok(empty.warnings.some((warning) => warning.includes("No valid")));

console.log("mlb-batter-prop-probability-calibration.test.ts passed");
