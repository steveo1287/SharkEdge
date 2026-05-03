import assert from "node:assert/strict";

import { simPickProbabilityBucket, simProbabilityBucket } from "@/services/simulation/sim-accuracy-buckets";
import { applySimAccuracyGuardrail, type SimAccuracyGuardrailMap } from "@/services/simulation/sim-accuracy-guardrail";

assert.equal(simProbabilityBucket(0.641), "60-70%");
assert.equal(simProbabilityBucket(0.999), "90-100%");
assert.equal(simPickProbabilityBucket(0.41, 0.59), "50-60%");
assert.equal(simPickProbabilityBucket(0.73, 0.27), "70-80%");

const noBucket = applySimAccuracyGuardrail({
  league: "NBA",
  tier: "attack",
  probability: 0.64,
  confidence: 0.72,
  noBet: false,
  reasons: ["raw model signal"],
  guardrails: {}
});

assert.equal(noBucket.tier, "watch");
assert.equal(noBucket.noBet, true);
assert.equal(noBucket.downgraded, true);
assert.ok(noBucket.confidence != null && noBucket.confidence < 0.72);
assert.ok(noBucket.reasons[0].includes("has no graded history"));

const noBucketMlb = applySimAccuracyGuardrail({
  league: "MLB",
  tier: "attack",
  probability: 0.64,
  confidence: 0.72,
  noBet: false,
  reasons: ["raw model signal"],
  guardrails: {}
});

assert.equal(noBucketMlb.tier, "attack");
assert.equal(noBucketMlb.noBet, false);
assert.equal(noBucketMlb.downgraded, false);
assert.equal(noBucketMlb.confidence, 0.72);

const lowSampleGuardrails: SimAccuracyGuardrailMap = {
  "NBA:60-70%": {
    league: "NBA",
    bucket: "60-70%",
    count: 12,
    avgPredicted: 0.64,
    actualRate: 0.61,
    brier: 0.21,
    state: "insufficient",
    note: "60-70% bucket has 12/25 graded samples; NBA action is blocked until this bucket has enough evidence."
  },
  "MLB:60-70%": {
    league: "MLB",
    bucket: "60-70%",
    count: 12,
    avgPredicted: 0.64,
    actualRate: 0.61,
    brier: 0.21,
    state: "insufficient",
    note: "60-70% bucket has 12/25 graded samples."
  }
};

const lowSample = applySimAccuracyGuardrail({
  league: "NBA",
  tier: "attack",
  probability: 0.64,
  confidence: 0.71,
  noBet: false,
  reasons: [],
  guardrails: lowSampleGuardrails
});

assert.equal(lowSample.tier, "watch");
assert.equal(lowSample.noBet, true);
assert.equal(lowSample.downgraded, true);
assert.ok(lowSample.reasons[0].includes("insufficient") || lowSample.reasons[0].includes("blocked"));

const lowSampleMlb = applySimAccuracyGuardrail({
  league: "MLB",
  tier: "attack",
  probability: 0.64,
  confidence: 0.71,
  noBet: false,
  reasons: [],
  guardrails: lowSampleGuardrails
});

assert.equal(lowSampleMlb.tier, "attack");
assert.equal(lowSampleMlb.noBet, false);
assert.equal(lowSampleMlb.downgraded, false);
assert.equal(lowSampleMlb.confidence, 0.71);

const poorGuardrails: SimAccuracyGuardrailMap = {
  "NBA:60-70%": {
    league: "NBA",
    bucket: "60-70%",
    count: 44,
    avgPredicted: 0.66,
    actualRate: 0.49,
    brier: 0.31,
    state: "poor",
    note: "60-70% bucket is overconfident."
  }
};

const poor = applySimAccuracyGuardrail({
  league: "NBA",
  tier: "attack",
  probability: 0.64,
  confidence: 0.75,
  noBet: false,
  reasons: [],
  guardrails: poorGuardrails
});

assert.equal(poor.tier, "pass");
assert.equal(poor.noBet, true);
assert.equal(poor.downgraded, true);
assert.ok(poor.confidence != null && poor.confidence <= 0.57);

const healthyGuardrails: SimAccuracyGuardrailMap = {
  "NBA:60-70%": {
    league: "NBA",
    bucket: "60-70%",
    count: 31,
    avgPredicted: 0.64,
    actualRate: 0.62,
    brier: 0.2,
    state: "healthy",
    note: "60-70% bucket is currently healthy."
  }
};

const healthy = applySimAccuracyGuardrail({
  league: "NBA",
  tier: "attack",
  probability: 0.64,
  confidence: 0.73,
  noBet: false,
  reasons: [],
  guardrails: healthyGuardrails
});

assert.equal(healthy.tier, "attack");
assert.equal(healthy.noBet, false);
assert.equal(healthy.downgraded, false);
assert.equal(healthy.confidence, 0.73);

console.log("sim-accuracy-guardrail.test.ts passed");
