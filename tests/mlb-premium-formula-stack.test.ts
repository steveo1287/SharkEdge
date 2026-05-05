import assert from "node:assert/strict";

import {
  buildMlbPremiumFormulaStack,
  log5WinProbability,
  pythagoreanHomeWinProbability
} from "@/services/simulation/mlb-premium-formula-stack";

const pyth = pythagoreanHomeWinProbability(5.2, 4.1);
assert.ok(pyth > 0.5);
assert.ok(pyth < 0.75);

const log5 = log5WinProbability(0.6, 0.5);
assert.ok(log5 > 0.5);
assert.ok(log5 < 0.7);

const stack = buildMlbPremiumFormulaStack({
  rawHomeWinPct: 0.64,
  v8HomeWinPct: 0.61,
  v7HomeWinPct: 0.59,
  marketHomeNoVigProbability: 0.54,
  homeRuns: 5.1,
  awayRuns: 4.2
});

assert.equal(stack.modelVersion, "mlb-premium-formula-stack-v1");
assert.ok(stack.pythagoreanHomeWinPct > 0.5);
assert.ok(stack.finalHomeWinPct > 0.54);
assert.ok(stack.finalHomeWinPct < 0.64);
assert.ok((stack.edgeHomePct ?? 0) > 0);
assert.ok(stack.formulaDisagreement >= 0);
assert.ok(stack.confidenceCap <= 0.72);
assert.equal(stack.finalAwayWinPct, Number((1 - stack.finalHomeWinPct).toFixed(4)));

const missingMarket = buildMlbPremiumFormulaStack({
  rawHomeWinPct: 0.49,
  v8HomeWinPct: 0.52,
  v7HomeWinPct: 0.51,
  marketHomeNoVigProbability: null,
  homeRuns: 4.4,
  awayRuns: 4.3
});
assert.equal(missingMarket.edgeHomePct, null);
assert.equal(missingMarket.marketHomeNoVigProbability, null);

console.log("mlb-premium-formula-stack.test.ts passed");
