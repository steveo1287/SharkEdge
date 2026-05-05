import assert from "node:assert/strict";

import {
  DEFAULT_MLB_PREMIUM_FORMULA_PROFILE,
  DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS
} from "@/services/simulation/mlb-premium-formula-profile";
import { buildMlbPremiumFormulaStack } from "@/services/simulation/mlb-premium-formula-stack";

const weights = DEFAULT_MLB_PREMIUM_FORMULA_WEIGHTS;
const total = weights.rawWeight + weights.v8Weight + weights.v7Weight + weights.pythagoreanWeight;
assert.ok(Math.abs(total - 1) < 0.0001);
assert.equal(DEFAULT_MLB_PREMIUM_FORMULA_PROFILE.status, "DEFAULT");
assert.equal(DEFAULT_MLB_PREMIUM_FORMULA_PROFILE.sampleSize, 0);
assert.ok(weights.v7Weight > weights.rawWeight);
assert.ok(weights.confidenceCapBase > weights.confidenceCapFloor);

const stack = buildMlbPremiumFormulaStack({
  rawHomeWinPct: 0.62,
  v8HomeWinPct: 0.6,
  v7HomeWinPct: 0.58,
  marketHomeNoVigProbability: 0.54,
  homeRuns: 5,
  awayRuns: 4.1,
  profile: DEFAULT_MLB_PREMIUM_FORMULA_PROFILE
});

assert.equal(stack.profileStatus, "DEFAULT");
assert.equal(stack.profileSampleSize, 0);
assert.equal(stack.weights.v7Weight, weights.v7Weight);
assert.ok(stack.finalHomeWinPct > 0.54);
assert.ok(stack.confidenceCap <= weights.confidenceCapBase);

console.log("mlb-premium-formula-profile.test.ts passed");
