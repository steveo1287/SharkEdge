import assert from "node:assert/strict";

import { getMlbV8ProductionMode, type MlbV8ProductionMode } from "@/services/simulation/mlb-v8-production-control";
import { applyMlbV8PromotionGateToPremiumPolicy } from "@/services/simulation/mlb-v8-gated-premium-policy";
import type { MlbV8PromotionGate } from "@/services/simulation/mlb-v8-promotion-gate";
import type { MlbPremiumPickPolicyResult } from "@/services/simulation/mlb-premium-pick-policy";

const basePolicy: MlbPremiumPickPolicyResult = {
  tier: "attack",
  noBet: false,
  confidence: 0.68,
  pickSide: "HOME",
  policyVersion: "mlb-premium-pick-policy-v1",
  downgraded: false,
  originalTier: "attack",
  originalNoBet: false,
  originalConfidence: 0.68,
  blockers: [],
  warnings: [],
  reasons: ["base policy"],
  gates: {
    hasMarket: true,
    edgeAbs: 0.071,
    playerImpactApplied: true,
    playerImpactConfidence: 0.82,
    profileStatus: "LEARNED",
    profileSampleSize: 600,
    startersConfirmed: true,
    lineupsConfirmed: true
  }
};

function gate(mode: MlbV8PromotionGate["mode"]): MlbV8PromotionGate {
  return {
    ok: true,
    generatedAt: "2026-01-01T00:00:00.000Z",
    windowDays: 180,
    modelVersion: "mlb-intel-v8-player-impact+v7-calibration",
    mode,
    sourceStatus:
      mode === "broad_promotion" ? "PROMOTE" :
      mode === "bucket_promotion" ? "SHADOW" :
      mode === "shadow_only" ? "INSUFFICIENT_DATA" :
      "BLOCK",
    allowOfficialV8Promotion: mode === "broad_promotion" || mode === "bucket_promotion",
    allowAttackPicks: mode === "broad_promotion",
    allowWatchPicks: mode === "broad_promotion" || mode === "bucket_promotion",
    requireShadowCapture: mode !== "broad_promotion",
    allowedBuckets: {
      confidence: mode === "broad_promotion" ? ["all"] : ["high_confidence"],
      lift: mode === "broad_promotion" ? ["all"] : ["v8_clear_improve"],
      playerImpact: mode === "broad_promotion" ? ["all"] : ["player_impact_applied"]
    },
    hardRules: ["Never count pending rows toward V8 promotion."],
    blockers: mode === "blocked" ? ["blocked for test"] : [],
    warnings: mode === "bucket_promotion" || mode === "shadow_only" ? ["restricted for test"] : [],
    recommendations: [],
    report: {
      ok: true,
      databaseReady: true,
      generatedAt: "2026-01-01T00:00:00.000Z",
      windowDays: 180,
      modelVersion: "mlb-intel-v8-player-impact+v7-calibration",
      status:
        mode === "broad_promotion" ? "PROMOTE" :
        mode === "bucket_promotion" ? "SHADOW" :
        mode === "shadow_only" ? "INSUFFICIENT_DATA" :
        "BLOCK",
      summary: "test report",
      officialPicks: emptyMetricSet,
      snapshots: emptyMetricSet,
      buckets: { playerImpact: [], confidence: [], lift: [] },
      blockers: [],
      warnings: [],
      recommendations: []
    }
  };
}

const emptyMetricSet = {
  count: 0,
  wins: 0,
  losses: 0,
  winRate: null,
  playerImpactRows: 0,
  playerImpactRate: null,
  avgPlayerImpactConfidence: null,
  baselineBrier: null,
  v8ImpactBrier: null,
  finalCalibratedBrier: null,
  marketBrier: null,
  v8EdgeVsBaseline: null,
  finalEdgeVsBaseline: null,
  finalEdgeVsMarket: null,
  avgClv: null,
  avgEdge: null
};

const modes: Array<[string | undefined, MlbV8ProductionMode]> = [
  [undefined, "gated"],
  ["", "gated"],
  ["bad", "gated"],
  ["off", "off"],
  ["shadow", "shadow"],
  ["gated", "gated"],
  ["force_v7", "force_v7"]
];

for (const [input, expected] of modes) {
  assert.equal(getMlbV8ProductionMode(input), expected);
}

const broad = applyMlbV8PromotionGateToPremiumPolicy(basePolicy, gate("broad_promotion"));
assert.equal(broad.tier, "attack");
assert.equal(broad.noBet, false);
assert.equal(broad.pickSide, "HOME");

const bucket = applyMlbV8PromotionGateToPremiumPolicy(basePolicy, gate("bucket_promotion"));
assert.equal(bucket.tier, "watch");
assert.equal(bucket.noBet, false);
assert.equal(bucket.pickSide, "HOME");
assert.ok(bucket.warnings.some((warning) => warning.includes("restricted")));

const shadow = applyMlbV8PromotionGateToPremiumPolicy(basePolicy, gate("shadow_only"));
assert.equal(shadow.tier, "pass");
assert.equal(shadow.noBet, true);
assert.equal(shadow.pickSide, null);
assert.ok(shadow.blockers.some((blocker) => blocker.includes("shadow capture")));

const blocked = applyMlbV8PromotionGateToPremiumPolicy(basePolicy, gate("blocked"));
assert.equal(blocked.tier, "pass");
assert.equal(blocked.noBet, true);
assert.equal(blocked.pickSide, null);
assert.ok(blocked.blockers.some((blocker) => blocker.includes("blocked")));

console.log("mlb-v8-production-control.test.ts passed");
