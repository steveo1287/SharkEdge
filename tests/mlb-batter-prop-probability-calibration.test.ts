import assert from "node:assert/strict";

import { buildMlbBatterPropProbabilityCalibration, applyMlbBatterPropProbabilityCalibration, type MlbSettledBatterPropProbabilityRow } from "@/services/simulation/mlb-batter-prop-probability-calibration";
import type { MlbPropSurfaceOutcome } from "@/services/simulation/mlb-batter-prop-surface";

const rows: MlbSettledBatterPropProbabilityRow[] = [];
for (let index = 0; index < 30; index += 1) {
  rows.push({
    playerId: "p1",
    playerName: "Power Hitter",
    hitterArchetype: "POWER",
    pitcherArchetype: "VULNERABLE",
    matchupClusterKey: "POWER_vs_VULNERABLE",
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
assert.equal(calibration.modelVersion, "mlb-batter-probability-calibration-v2");
assert.equal(calibration.sampleSize, 50);
assert.ok(calibration.brierScore > 0);
assert.ok(calibration.logLoss > 0);
assert.ok(calibration.bins.length >= 4);
assert.ok(calibration.warnings.some((warning) => warning.includes("rejected")));

const hitsBin = calibration.bins.find((bin) => bin.market === "HITS" && bin.line === 0.5 && bin.side === "OVER" && bin.scopeType === "MARKET");
assert.ok(hitsBin);
assert.ok(hitsBin!.sampleSize >= 20);
assert.ok(hitsBin!.observedRate > hitsBin!.averagePredicted);
assert.ok(hitsBin!.probabilityOffset > 0);
assert.ok(hitsBin!.reliability >= 1);

const playerBin = calibration.bins.find((bin) => bin.scopeType === "PLAYER_MARKET" && bin.scopeKey.includes("p1"));
assert.ok(playerBin);
assert.ok(playerBin!.probabilityOffset > 0);

const clusterBin = calibration.bins.find((bin) => bin.scopeType === "MATCHUP_CLUSTER" && bin.scopeKey.includes("POWER_vs_VULNERABLE"));
assert.ok(clusterBin);
assert.ok(clusterBin!.probabilityOffset > 0);

const outcome: MlbPropSurfaceOutcome = {
  market: "HITS",
  line: 0.5,
  side: "OVER",
  probability: 0.65,
  fairAmerican: -186,
  confidence: 0.72
};

const adjusted = applyMlbBatterPropProbabilityCalibration({
  outcome,
  calibration,
  playerId: "p1",
  hitterArchetype: "POWER",
  pitcherArchetype: "VULNERABLE",
  matchupClusterKey: "POWER_vs_VULNERABLE"
});
assert.equal(adjusted.calibrationApplied, true);
assert.equal(adjusted.calibrationScopeType, "PLAYER_MARKET");
assert.ok(adjusted.calibrationSampleSize >= 20);
assert.ok(adjusted.probability > outcome.probability);
assert.equal(adjusted.rawProbability, outcome.probability);
assert.ok(Number.isFinite(adjusted.fairAmerican));
assert.ok(adjusted.calibrationReliability > 0);

const clusterAdjusted = applyMlbBatterPropProbabilityCalibration({ outcome, calibration, matchupClusterKey: "POWER_vs_VULNERABLE" });
assert.equal(clusterAdjusted.calibrationScopeType, "MATCHUP_CLUSTER");

const uncalibrated = applyMlbBatterPropProbabilityCalibration({ outcome, calibration: null });
assert.equal(uncalibrated.calibrationApplied, false);
assert.equal(uncalibrated.probability, outcome.probability);

const empty = buildMlbBatterPropProbabilityCalibration({ rows: [] });
assert.equal(empty.sampleSize, 0);
assert.ok(empty.warnings.some((warning) => warning.includes("No valid")));

console.log("mlb-batter-prop-probability-calibration.test.ts passed");
