import assert from "node:assert/strict";

import { mainBrainLabel } from "@/services/simulation/main-sim-brain";

assert.equal(mainBrainLabel("MLB"), "mlb-intel-v8-player-impact+learned-formula-profile+mlb-intel-v7-calibration+premium-policy");
assert.equal(mainBrainLabel("NBA"), "nba-guarded-winner-anchor");
assert.equal(mainBrainLabel("NHL"), "base-sim-projection");

console.log("main-sim-brain.test.ts passed");
