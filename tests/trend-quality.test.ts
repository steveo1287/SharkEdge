import assert from "node:assert/strict";

import {
  americanToImpliedProbability,
  assessTrendQuality,
  calculateFlatStakeRoi,
  getLineSensitivity,
  probabilityToAmericanOdds
} from "@/services/trends/trend-quality";

assert.equal(Number(americanToImpliedProbability(-150)?.toFixed(4)), 0.6);
assert.equal(Number(americanToImpliedProbability(150)?.toFixed(4)), 0.4);
assert.equal(americanToImpliedProbability(0), null);
assert.equal(americanToImpliedProbability(99), null);
assert.equal(probabilityToAmericanOdds(0.6), -150);
assert.equal(probabilityToAmericanOdds(0.4), 150);

const roiWithPush = calculateFlatStakeRoi([
  { result: "W", oddsAmerican: -110 },
  { result: "L", oddsAmerican: -110 },
  { result: "P", oddsAmerican: -110 }
]);
assert.equal(roiWithPush, -4.55);

const eliteTrend = assessTrendQuality({
  id: "elite-total-trend",
  market: "total",
  sampleSize: 320,
  hitRate: 58,
  roi: 12,
  currentOddsAmerican: -110,
  averageClv: 2,
  positiveClvRate: 62,
  recencyHitRate: 57,
  marketBreadth: 3,
  missingDataRate: 0.01,
  filterCount: 2,
  seasonCount: 3,
  teamScopeCount: 12,
  line: 8.5,
  validLineRange: { min: 7.5, max: 9.5 },
  source: "market-edge"
});
assert.ok(eliteTrend.quality.score >= 75);
assert.ok(eliteTrend.quality.tier === "A" || eliteTrend.quality.tier === "S");
assert.equal(eliteTrend.quality.overfitRisk, "low");
assert.equal(eliteTrend.lineSensitivity.inValidRange, true);
assert.ok(eliteTrend.market.edgePercent && eliteTrend.market.edgePercent > 5);

const thinSampleTrend = assessTrendQuality({
  id: "thin-sample",
  market: "spread",
  sampleSize: 28,
  hitRate: 72,
  roi: 18,
  currentOddsAmerican: -110,
  averageClv: 3,
  positiveClvRate: 68,
  marketBreadth: 3,
  filterCount: 6,
  seasonCount: 1,
  teamScopeCount: 1,
  source: "market-edge"
});
assert.equal(thinSampleTrend.quality.tier, "HIDE");
assert.equal(thinSampleTrend.quality.overfitRisk, "high");
assert.ok(thinSampleTrend.warnings.some((warning) => warning.includes("Sample below actionable floor")));

const noCurrentOddsTrend = assessTrendQuality({
  id: "research-only",
  market: "moneyline",
  sampleSize: 240,
  hitRate: 59,
  roi: 10,
  filterCount: 4,
  seasonCount: 3,
  teamScopeCount: 8,
  source: "research-pattern"
});
assert.equal(noCurrentOddsTrend.quality.tier, "C");
assert.ok(noCurrentOddsTrend.warnings.some((warning) => warning.includes("No current sportsbook price")));
assert.ok(noCurrentOddsTrend.warnings.some((warning) => warning.includes("No closing-line-value support")));

const weakCurrentPriceTrend = assessTrendQuality({
  id: "priced-out",
  market: "moneyline",
  sampleSize: 180,
  hitRate: 54,
  roi: 6,
  currentOddsAmerican: -135,
  averageClv: 1.5,
  positiveClvRate: 59,
  marketBreadth: 2,
  filterCount: 3,
  seasonCount: 3,
  teamScopeCount: 10,
  source: "market-edge"
});
assert.equal(weakCurrentPriceTrend.quality.tier, "C");
assert.ok(weakCurrentPriceTrend.warnings.some((warning) => warning.includes("Current edge below actionable floor")));

const badDataTrend = assessTrendQuality({
  id: "bad-data",
  market: "total",
  sampleSize: 250,
  hitRate: 61,
  roi: 15,
  currentOddsAmerican: -105,
  averageClv: 2,
  positiveClvRate: 65,
  marketBreadth: 3,
  missingDataRate: 0.08,
  filterCount: 2,
  seasonCount: 4,
  teamScopeCount: 20,
  source: "market-edge"
});
assert.equal(badDataTrend.quality.tier, "HIDE");
assert.ok(badDataTrend.warnings.some((warning) => warning.includes("Missing-data rate")));

const outOfRange = getLineSensitivity("spread", 8.5, { min: -3, max: 3 });
assert.equal(outOfRange.inValidRange, false);
assert.ok(outOfRange.warning);

const inRange = getLineSensitivity("spread", -2.5, { min: -3, max: 3 });
assert.equal(inRange.inValidRange, true);
assert.equal(inRange.bucket, "short spread");

console.log("trend-quality tests passed");
