import assert from "node:assert/strict";

import { buildOpportunityProbabilityFusion } from "@/services/opportunities/opportunity-probability-fusion";

const fused = buildOpportunityProbabilityFusion({
  fairPriceAmerican: -125,
  marketProbability: 0.52,
  expectedValuePct: 2.8,
  reasons: [
    { category: "trend_support", label: "Trend", detail: "support", tone: "brand" },
    { category: "model_edge", label: "Model", detail: "support", tone: "success" }
  ],
  trapFlags: [],
  confidenceScore: 72,
  marketEfficiency: "MID_EFFICIENCY",
  truthCalibrationScoreDelta: 4,
  reasonCalibrationScoreDelta: 2,
  marketPathScoreDelta: 3
});

const conflicted = buildOpportunityProbabilityFusion({
  fairPriceAmerican: -125,
  marketProbability: 0.58,
  expectedValuePct: 2.8,
  reasons: [{ category: "trend_support", label: "Trend", detail: "support", tone: "brand" }],
  trapFlags: ["HIGH_MARKET_DISAGREEMENT", "LOW_CONFIDENCE_FAIR_PRICE"],
  confidenceScore: 54,
  marketEfficiency: "HIGH_EFFICIENCY",
  truthCalibrationScoreDelta: 0,
  reasonCalibrationScoreDelta: 0,
  marketPathScoreDelta: 0
});

assert.equal(fused.status, "APPLIED");
assert.equal((fused.posteriorEdgePct ?? 0) > 0, true);
assert.equal(conflicted.uncertaintyScore > fused.uncertaintyScore, true);
assert.equal(conflicted.confidencePenalty >= fused.confidencePenalty, true);

console.log("opportunity-probability-fusion.test.ts passed");
