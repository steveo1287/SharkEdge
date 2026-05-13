import assert from "node:assert/strict";

import { buildSharkTrendProof, describeSharkTrendFilters } from "../src/server/sharktrends/proof";

const filters = {
  league: "MLB" as const,
  marketType: "moneyline" as const,
  side: "FAVORITE" as const,
  homeAway: "HOME" as const,
  favoriteMinAbsPrice: 140,
  favoriteMaxAbsPrice: 180,
  minDataQualityScore: 60
};

const conditions = describeSharkTrendFilters(filters);
assert.ok(conditions.includes("home"));
assert.ok(conditions.includes("favorites"));
assert.ok(conditions.includes("favorite price 140 to 180"));

const proof = buildSharkTrendProof({
  filters,
  result: {
    sampleSize: 25,
    wins: 16,
    losses: 9,
    pushes: 0,
    voids: 2,
    winRate: 16 / 25,
    roiFlatStake: 0.12,
    unitsFlatStake: 3,
    avgOddsAmerican: -155,
    avgClosingOddsAmerican: -165,
    avgLine: null,
    avgClosingLine: null,
    clvAverage: -10,
    confidenceGrade: "C",
    dataQualityScore: 74
  },
  splits: {
    bySeason: {
      "2024": { sampleSize: 12, wins: 9, losses: 3, pushes: 0, units: 3, roi: 0.25 },
      "2025": { sampleSize: 13, wins: 7, losses: 6, pushes: 0, units: 0, roi: 0 }
    }
  },
  coverage: {
    minDate: "2024-04-01T00:00:00.000Z",
    maxDate: "2025-09-01T00:00:00.000Z",
    sourceKeys: ["sportsbookreview_historical"]
  }
});

assert.match(proof.headline, /MLB favorites/);
assert.match(proof.headline, /16-9/);
assert.ok(proof.evidenceBullets.some((value) => value.includes("Source coverage")));
assert.equal(proof.splitHighlights.best[0].label, "season: 2024");

const emptyProof = buildSharkTrendProof({
  filters,
  result: {
    sampleSize: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    voids: 0,
    winRate: 0,
    roiFlatStake: 0,
    unitsFlatStake: 0,
    confidenceGrade: "F",
    dataQualityScore: 0
  },
  splits: {}
});
assert.match(emptyProof.headline, /No graded MLB/);
console.log("sharktrends-proof tests passed");
