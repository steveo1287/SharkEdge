import assert from "node:assert/strict";

import {
  DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE,
  DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS
} from "@/services/simulation/mlb-v8-player-impact-profile";

assert.equal(DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE.modelVersion, "mlb-intel-v8-player-impact");
assert.equal(DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE.status, "DEFAULT");
assert.equal(DEFAULT_MLB_V8_PLAYER_IMPACT_PROFILE.sampleSize, 0);

const hitterWeightTotal = Object.values(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.hitterWeights)
  .reduce((sum, value) => sum + value, 0);
const pitcherWeightTotal = Object.values(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.pitcherWeights)
  .reduce((sum, value) => sum + value, 0);

assert.ok(Math.abs(hitterWeightTotal - 1) < 0.0001);
assert.ok(Math.abs(pitcherWeightTotal - 1) < 0.0001);
assert.ok(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.starterRunWeight > DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.bullpenRunWeight);
assert.ok(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.probabilityBlendMax > DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.probabilityBlendMin);
assert.ok(DEFAULT_MLB_V8_PLAYER_IMPACT_WEIGHTS.runDeltaCap <= 1);

console.log("mlb-v8-player-impact-profile.test.ts passed");
