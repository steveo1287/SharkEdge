import assert from "node:assert/strict";

import { hardenNbaWinnerBucket, wilsonLowerBound } from "@/services/simulation/nba-winner-calibration-hardening";
import type { NbaWinnerAdvancedBucket } from "@/services/simulation/nba-winner-calibration-metrics";

const lower = wilsonLowerBound(60, 100);
assert.ok(lower !== null && lower > 0.49 && lower < 0.51, `unexpected Wilson lower bound ${lower}`);
assert.equal(wilsonLowerBound(0, 0), null);

const baseBucket: NbaWinnerAdvancedBucket = {
  bucket: "56-60",
  status: "GREEN",
  sampleSize: 320,
  passCount: 18,
  hitRate: 0.61,
  expectedHitRate: 0.575,
  marketExpectedHitRate: 0.555,
  calibrationError: 0.018,
  avgBrier: 0.222,
  avgMarketBrier: 0.229,
  brierEdge: 0.007,
  avgLogLoss: 0.636,
  avgMarketLogLoss: 0.649,
  logLossEdge: 0.013,
  avgClvPct: 0.009,
  clvBeatRate: 0.57,
  roi: 0.034,
  totalProfitUnits: 10.88,
  maxDrawdown: -4.2,
  avgModelMarketEdge: 0.018,
  blockers: [],
  warnings: []
};

const proven = hardenNbaWinnerBucket(baseBucket);
assert.equal(proven.status, "PROVEN");
assert.equal(proven.shouldPass, false);
assert.equal(proven.shouldBlockStrongBet, false);
assert.ok(proven.proofScore >= 0.72);
assert.ok(proven.recommendedMaxModelDeltaPct > 0);

const noisySmallSample = hardenNbaWinnerBucket({
  ...baseBucket,
  sampleSize: 42,
  hitRate: 0.72,
  avgClvPct: 0.02,
  clvBeatRate: 0.62
});
assert.equal(noisySmallSample.status, "PASS");
assert.equal(noisySmallSample.shouldPass, true);
assert.ok(noisySmallSample.blockers.includes("bucket sample under 100"));

const marketLagging = hardenNbaWinnerBucket({
  ...baseBucket,
  brierEdge: -0.001,
  logLossEdge: -0.001,
  avgClvPct: -0.001,
  clvBeatRate: 0.44
});
assert.equal(marketLagging.status, "PASS");
assert.ok(marketLagging.blockers.includes("average CLV is not positive"));
assert.ok(marketLagging.blockers.includes("Brier edge does not beat market"));
assert.ok(marketLagging.blockers.includes("log-loss edge does not beat market"));
assert.ok(marketLagging.blockers.includes("CLV beat rate below 52%"));

const overCalibrated = hardenNbaWinnerBucket({
  ...baseBucket,
  calibrationError: 0.04
});
assert.equal(overCalibrated.status, "PASS");
assert.ok(overCalibrated.blockers.includes("calibration error above 2.5%"));

console.log("nba-winner-calibration-hardening.test.ts passed");
