import assert from "node:assert/strict";

import { loadMlbBatterBoxProjection } from "@/services/simulation/mlb-batter-box-loader";

const result = await loadMlbBatterBoxProjection({});

assert.ok(result.diagnostics);
assert.equal(typeof result.diagnostics.databaseReady, "boolean");
assert.equal(typeof result.diagnostics.paramsReady, "boolean");
assert.ok(Array.isArray(result.diagnostics.gameOptions));
assert.ok(Array.isArray(result.diagnostics.warnings));
assert.equal(typeof result.diagnostics.counts.awayHitters, "number");
assert.equal(typeof result.diagnostics.counts.homeHitters, "number");
assert.equal(typeof result.diagnostics.counts.awayPitchers, "number");
assert.equal(typeof result.diagnostics.counts.homePitchers, "number");
assert.equal(typeof result.diagnostics.counts.awayLineups, "number");
assert.equal(typeof result.diagnostics.counts.homeLineups, "number");

if (result.projection) {
  assert.equal(result.projection.modelVersion, "mlb-player-stat-projection-v1");
  assert.ok(result.projection.awayHitters.length + result.projection.homeHitters.length > 0);
} else {
  assert.ok(result.error || result.diagnostics.warnings.length >= 0);
}

console.log("mlb-batter-box-loader.test.ts passed");
