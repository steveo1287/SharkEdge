import assert from "node:assert/strict";

import { buildNbaSimHealthPolicy, enforceNbaSimHealthPolicy } from "@/services/simulation/nba-sim-health-policy";
import type { NbaBacktestDiagnostics } from "@/services/simulation/nba-sim-backtest-diagnostics";

const healthyDiagnostics: NbaBacktestDiagnostics = {
  sampleSize: 150,
  gradedCount: 150,
  roiPct: 4.2,
  clvPct: 1.1,
  brierScore: 0.215,
  marketBaselineBrierScore: 0.228,
  logLoss: 0.61,
  marketBaselineLogLoss: 0.64,
  hitRatePct: 56,
  hitRateByMarket: {
    moneyline: { count: 40, hitRatePct: 57.5 },
    spread: { count: 45, hitRatePct: 55.6 },
    total: { count: 35, hitRatePct: 54.3 },
    player_prop: { count: 30, hitRatePct: 56.7 }
  },
  hitRateByConfidence: {
    HIGH: { count: 45, hitRatePct: 60 },
    MEDIUM: { count: 55, hitRatePct: 56.4 },
    LOW: { count: 35, hitRatePct: 51.4 },
    INSUFFICIENT: { count: 15, hitRatePct: 46.7 }
  },
  profitByMarket: {
    moneyline: 4.1,
    spread: 2.2,
    total: 1.8,
    player_prop: 0.6
  },
  averageEdgeByMarket: {
    moneyline: 3.4,
    spread: 2.8,
    total: 2.1,
    player_prop: 1.5
  },
  maxDrawdownUnits: 7.2,
  calibrationBuckets: [],
  baselines: {
    marketNoVig: { brierScore: 0.228, logLoss: 0.64 },
    favorite: { count: 150, hitRatePct: 52 },
    homeTeam: { count: 150, hitRatePct: 51 },
    noBet: { roiPct: 0, profitUnits: 0 }
  },
  health: { status: "GREEN", blockers: [] }
};

const greenPolicy = buildNbaSimHealthPolicy({
  diagnostics: healthyDiagnostics,
  sourceHealth: "GREEN",
  injuryReportFresh: true,
  starQuestionable: false,
  calibrationBucketHealthy: true
});

assert.equal(greenPolicy.status, "GREEN");
assert.equal(greenPolicy.canBetNow, true);
assert.equal(greenPolicy.maxActionState, "BET_NOW");
assert.equal(greenPolicy.maxKellyPct, 0.5);
assert.equal(greenPolicy.blockers.length, 0);

const staleInjuryPolicy = buildNbaSimHealthPolicy({
  diagnostics: healthyDiagnostics,
  sourceHealth: "GREEN",
  injuryReportFresh: false,
  starQuestionable: false,
  calibrationBucketHealthy: true
});

assert.equal(staleInjuryPolicy.status, "YELLOW");
assert.equal(staleInjuryPolicy.canBetNow, false);
assert.equal(staleInjuryPolicy.maxActionState, "WATCH");
assert.equal(staleInjuryPolicy.maxKellyPct, 0);
assert.ok(staleInjuryPolicy.blockers.some((blocker) => blocker.includes("injury")));

const redPolicy = buildNbaSimHealthPolicy({
  diagnostics: null,
  sourceHealth: "RED",
  injuryReportFresh: null,
  starQuestionable: true,
  calibrationBucketHealthy: false
});

assert.equal(redPolicy.status, "RED");
assert.equal(redPolicy.canBetNow, false);
assert.equal(redPolicy.maxActionState, "PASS");
assert.equal(redPolicy.maxKellyPct, 0);
assert.ok(redPolicy.blockers.length >= 5);

const runtimeGreenPolicy = buildNbaSimHealthPolicy({
  diagnostics: null,
  diagnosticsRequired: false,
  sourceHealth: "GREEN",
  injuryReportFresh: true,
  starQuestionable: false,
  calibrationBucketHealthy: true
});

assert.equal(runtimeGreenPolicy.status, "GREEN");
assert.equal(runtimeGreenPolicy.canBetNow, true);
assert.equal(runtimeGreenPolicy.maxActionState, "BET_NOW");
assert.equal(runtimeGreenPolicy.blockers.length, 0);
assert.ok(runtimeGreenPolicy.checklist.some((item) => item.key === "sample_size" && item.critical === false));

const runtimeYellowPolicy = buildNbaSimHealthPolicy({
  diagnostics: null,
  diagnosticsRequired: false,
  sourceHealth: "YELLOW",
  injuryReportFresh: true,
  starQuestionable: false,
  calibrationBucketHealthy: true
});

const cappedWatch = enforceNbaSimHealthPolicy({
  tier: "attack",
  noBet: false,
  confidence: 0.74,
  reasons: ["Raw NBA signal cleared accuracy guard."],
  policy: runtimeYellowPolicy
});

assert.equal(cappedWatch.tier, "watch");
assert.equal(cappedWatch.noBet, true);
assert.ok(cappedWatch.confidence <= 0.57);
assert.equal(cappedWatch.capped, true);
assert.ok(cappedWatch.reasons.some((reason) => reason.includes("capped")));

const forcedPass = enforceNbaSimHealthPolicy({
  tier: "attack",
  noBet: false,
  confidence: 0.74,
  reasons: ["Raw NBA signal cleared accuracy guard."],
  policy: redPolicy
});

assert.equal(forcedPass.tier, "pass");
assert.equal(forcedPass.noBet, true);
assert.ok(forcedPass.confidence <= 0.49);
assert.equal(forcedPass.capped, true);
assert.ok(forcedPass.reasons.some((reason) => reason.includes("forced PASS")));

console.log("nba-sim-health-policy.test.ts passed");
