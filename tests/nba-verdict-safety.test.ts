import assert from "node:assert/strict";

import { applyNbaVerdictSafety } from "@/services/simulation/nba-verdict-safety";
import type { MarketVerdict } from "@/services/simulation/sim-verdict-engine";

function baseVerdict(overrides: Partial<MarketVerdict> = {}): MarketVerdict {
  return {
    market: "moneyline",
    side: "HOME",
    rating: "STRONG_BET",
    edgeScore: 82,
    edgePct: 7.2,
    confidence: "HIGH",
    headline: "Home ML edge",
    explanation: "Raw model likes home side.",
    topDrivers: ["market edge"],
    simValue: 0.62,
    marketValue: 0.55,
    delta: 0.07,
    trapFlags: [],
    trapExplanation: null,
    actionState: "BET_NOW",
    timingState: "WINDOW_OPEN",
    kellyPct: 12.5,
    ...overrides
  };
}

const healthy = applyNbaVerdictSafety({
  verdict: baseVerdict(),
  modelHealthGreen: true,
  sourceHealthGreen: true,
  injuryReportFresh: true,
  calibrationBucketHealthy: true,
  noVigMarketAvailable: true
});

assert.equal(healthy.rating, "STRONG_BET");
assert.equal(healthy.actionState, "BET_NOW");
assert.equal(healthy.kellyPct, 0.5);

const lowConfidence = applyNbaVerdictSafety({
  verdict: baseVerdict({ confidence: "LOW" }),
  modelHealthGreen: true,
  sourceHealthGreen: true,
  injuryReportFresh: true,
  calibrationBucketHealthy: true,
  noVigMarketAvailable: true
});

assert.equal(lowConfidence.rating, "LEAN");
assert.equal(lowConfidence.actionState, "WATCH");
assert.equal(lowConfidence.kellyPct, 0);
assert.ok(lowConfidence.explanation.includes("LOW"));

const staleInjury = applyNbaVerdictSafety({
  verdict: baseVerdict(),
  modelHealthGreen: true,
  sourceHealthGreen: true,
  injuryReportFresh: false,
  calibrationBucketHealthy: true,
  noVigMarketAvailable: true
});

assert.equal(staleInjury.rating, "LEAN");
assert.equal(staleInjury.actionState, "WATCH");
assert.equal(staleInjury.kellyPct, 0);
assert.ok(staleInjury.explanation.includes("injury"));

const noVigMissing = applyNbaVerdictSafety({
  verdict: baseVerdict({ rating: "LEAN", actionState: "WAIT", kellyPct: 2.2 }),
  modelHealthGreen: true,
  sourceHealthGreen: true,
  injuryReportFresh: true,
  calibrationBucketHealthy: true,
  noVigMarketAvailable: false
});

assert.equal(noVigMissing.rating, "NEUTRAL");
assert.equal(noVigMissing.actionState, "WATCH");
assert.equal(noVigMissing.kellyPct, 0);
assert.ok(noVigMissing.explanation.includes("no-vig"));

const upstreamNoBet = applyNbaVerdictSafety({
  verdict: baseVerdict({ confidence: "MEDIUM", kellyPct: 0.4 }),
  modelHealthGreen: true,
  sourceHealthGreen: true,
  injuryReportFresh: true,
  calibrationBucketHealthy: true,
  noVigMarketAvailable: true,
  noBet: true,
  blockerReasons: ["Accuracy bucket unproven."]
});

assert.equal(upstreamNoBet.rating, "LEAN");
assert.equal(upstreamNoBet.actionState, "WATCH");
assert.equal(upstreamNoBet.kellyPct, 0);
assert.ok(upstreamNoBet.explanation.includes("Accuracy bucket unproven"));

console.log("nba-verdict-safety.test.ts passed");
