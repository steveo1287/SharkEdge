import assert from "node:assert/strict";

import { buildMlbCalibrationRecommendations } from "@/services/simulation/mlb-calibration-recommendations";
import type { MlbCalibrationBucket, MlbCalibrationMetricSet } from "@/services/simulation/mlb-v8-calibration-lab";

const emptyMetrics: MlbCalibrationMetricSet = {
  count: 0,
  wins: 0,
  losses: 0,
  winRate: null,
  avgProbability: null,
  brier: null,
  logLoss: null,
  marketBrier: null,
  marketLogLoss: null,
  brierEdgeVsMarket: null,
  logLossEdgeVsMarket: null,
  neutralBrier: 0.25,
  neutralLogLoss: 0.6931,
  avgEdge: null,
  avgClv: null,
  roi: null
};

const weakProbBucket: MlbCalibrationBucket = {
  ...emptyMetrics,
  bucket: "60-64%",
  min: 0.6,
  max: 0.65,
  count: 40,
  wins: 18,
  losses: 22,
  winRate: 0.45,
  avgProbability: 0.62,
  brier: 0.29,
  marketBrier: 0.24
};

const recommendations = buildMlbCalibrationRecommendations({
  officialPicks: emptyMetrics,
  candidatePicks: { ...emptyMetrics, count: 12 },
  snapshots: { ...emptyMetrics, count: 328, brierEdgeVsMarket: 0.026 },
  probabilityBuckets: [weakProbBucket],
  edgeBuckets: [],
  playerImpactBuckets: [],
  clvBuckets: []
});

assert.ok(recommendations.some((item) => item.includes("No official MLB picks")));
assert.ok(recommendations.some((item) => item.includes("Downgrade 60-64%")));
assert.ok(recommendations.some((item) => item.includes("beating market Brier")));

console.log("mlb-calibration-recommendations.test.ts passed");
