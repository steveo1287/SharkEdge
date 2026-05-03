import assert from "node:assert/strict";

import { summarizePickAccuracyBuckets } from "@/services/simulation/sim-pick-accuracy-summary";

const buckets = summarizePickAccuracyBuckets([
  {
    league: "NBA",
    model_home_win_pct: 0.41,
    model_away_win_pct: 0.59,
    home_won: false
  },
  {
    league: "NBA",
    model_home_win_pct: 0.42,
    model_away_win_pct: 0.58,
    home_won: true
  },
  {
    league: "NBA",
    model_home_win_pct: 0.73,
    model_away_win_pct: 0.27,
    home_won: true
  },
  {
    league: "MLB",
    model_home_win_pct: 0.61,
    model_away_win_pct: 0.39,
    home_won: false
  }
]);

const nbaAwayPickBucket = buckets.find((bucket) => bucket.league === "NBA" && bucket.bucket === "50-60%");
assert.ok(nbaAwayPickBucket);
assert.equal(nbaAwayPickBucket.count, 2);
assert.equal(nbaAwayPickBucket.avgPredicted, 0.585);
assert.equal(nbaAwayPickBucket.actualRate, 0.5);

const nbaHomePickBucket = buckets.find((bucket) => bucket.league === "NBA" && bucket.bucket === "70-80%");
assert.ok(nbaHomePickBucket);
assert.equal(nbaHomePickBucket.count, 1);
assert.equal(nbaHomePickBucket.avgPredicted, 0.73);
assert.equal(nbaHomePickBucket.actualRate, 1);
assert.equal(nbaHomePickBucket.brier, 0.0729);

const mlbBucket = buckets.find((bucket) => bucket.league === "MLB" && bucket.bucket === "60-70%");
assert.ok(mlbBucket);
assert.equal(mlbBucket.count, 1);
assert.equal(mlbBucket.actualRate, 0);

console.log("sim-pick-accuracy-summary.test.ts passed");
