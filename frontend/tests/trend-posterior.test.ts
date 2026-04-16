import assert from "node:assert/strict";

import { buildTrendPosterior } from "@/services/trends/posterior/trend-posterior";

const smallSample = buildTrendPosterior({
  hitRate: 0.61,
  marketProbability: 0.55,
  sampleSize: 12,
  recentSampleSize: 2,
  avgClv: 1.2,
  beatCloseRate: 0.54,
  validationScore: 420
});

const strongSample = buildTrendPosterior({
  hitRate: 0.61,
  marketProbability: 0.55,
  sampleSize: 128,
  recentSampleSize: 18,
  avgClv: 8.1,
  beatCloseRate: 0.61,
  validationScore: 860
});

assert.equal(strongSample.posteriorProbability! > smallSample.posteriorProbability!, true);
assert.equal(strongSample.uncertaintyScore < smallSample.uncertaintyScore, true);
assert.equal(Math.abs(smallSample.shrunkLiftPct) < Math.abs(smallSample.rawLiftPct), true);

console.log("trend-posterior.test.ts passed");
