import assert from "node:assert/strict";

import { buildNbaSimBacktestDiagnostics, type NbaBacktestPick } from "@/services/simulation/nba-sim-backtest-diagnostics";

const picks: NbaBacktestPick[] = [
  {
    id: "1",
    market: "moneyline",
    confidence: "HIGH",
    predictedProbability: 0.62,
    marketNoVigProbability: 0.55,
    oddsAmerican: -110,
    stakeUnits: 1,
    edgePct: 6.5,
    closingLineValuePct: 1.2,
    result: "win"
  },
  {
    id: "2",
    market: "spread",
    confidence: "MEDIUM",
    predictedProbability: 0.58,
    marketNoVigProbability: 0.52,
    oddsAmerican: -110,
    stakeUnits: 1,
    edgePct: 4.2,
    closingLineValuePct: 0.6,
    result: "loss"
  },
  {
    id: "3",
    market: "total",
    confidence: "LOW",
    predictedProbability: 0.54,
    marketNoVigProbability: 0.5,
    oddsAmerican: 100,
    stakeUnits: 1,
    edgePct: 3.1,
    closingLineValuePct: -0.2,
    result: "push"
  },
  {
    id: "4",
    market: "player_prop",
    confidence: "INSUFFICIENT",
    predictedProbability: 0.57,
    marketNoVigProbability: null,
    oddsAmerican: -105,
    stakeUnits: 1,
    edgePct: 2.6,
    result: "void"
  }
];

const diagnostics = buildNbaSimBacktestDiagnostics(picks);

assert.equal(diagnostics.sampleSize, 4);
assert.equal(diagnostics.gradedCount, 2);
assert.equal(diagnostics.hitRatePct, 50);
assert.ok(typeof diagnostics.roiPct === "number");
assert.ok(typeof diagnostics.clvPct === "number");
assert.ok(typeof diagnostics.brierScore === "number");
assert.ok(typeof diagnostics.logLoss === "number");
assert.ok(diagnostics.hitRateByMarket.moneyline.hitRatePct === 100);
assert.ok(diagnostics.hitRateByMarket.spread.hitRatePct === 0);
assert.ok(diagnostics.profitByMarket.moneyline > 0);
assert.ok(diagnostics.maxDrawdownUnits >= 0);
assert.ok(Array.isArray(diagnostics.calibrationBuckets));
assert.ok(["GREEN", "YELLOW", "RED"].includes(diagnostics.health.status));
assert.equal(diagnostics.baselines.noBet.roiPct, 0);

console.log("nba-sim-backtest-diagnostics.test.ts passed");
