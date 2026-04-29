import assert from "node:assert/strict";

import {
  americanToImpliedProbability,
  assessTrendQuality,
  calculateFlatStakeRoi,
  getLineSensitivity,
  probabilityToAmericanOdds,
  type TrendQualityTier
} from "@/services/trends/trend-quality";

function tierRank(tier: TrendQualityTier) {
  return { HIDE: 0, C: 1, B: 2, A: 3, S: 4 }[tier];
}

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
assert.equal(eliteTrend.quality.actionability, "ACTIONABLE");
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
assert.equal(thinSampleTrend.quality.actionability, "HIDE");
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
assert.equal(noCurrentOddsTrend.quality.actionability, "RESEARCH_ONLY");
assert.ok(noCurrentOddsTrend.warnings.some((warning) => warning.includes("No current sportsbook price")));
assert.ok(noCurrentOddsTrend.warnings.some((warning) => warning.includes("No closing-line-value support")));
assert.ok(noCurrentOddsTrend.gateReasons.some((reason) => reason.includes("Missing current sportsbook price")));

const weakCurrentPriceTrend = assessTrendQuality({
  id: "priced-out",
  market: "moneyline",
  sampleSize: 180,
  hitRate: 54,
  roi: 6,
  currentOddsAmerican: -115,
  averageClv: 1.5,
  positiveClvRate: 59,
  marketBreadth: 2,
  filterCount: 3,
  seasonCount: 3,
  teamScopeCount: 10,
  source: "market-edge"
});
assert.equal(weakCurrentPriceTrend.quality.tier, "C");
assert.equal(weakCurrentPriceTrend.quality.actionability, "WATCHLIST");
assert.ok(weakCurrentPriceTrend.warnings.some((warning) => warning.includes("Current edge below actionable floor")));

const negativeEvTrend = assessTrendQuality({
  id: "negative-ev",
  market: "moneyline",
  sampleSize: 220,
  hitRate: 54,
  roi: 9,
  currentOddsAmerican: -150,
  averageClv: 1.8,
  positiveClvRate: 61,
  marketBreadth: 3,
  filterCount: 2,
  seasonCount: 4,
  teamScopeCount: 16,
  source: "market-edge"
});
assert.equal(negativeEvTrend.quality.tier, "HIDE");
assert.equal(negativeEvTrend.quality.actionability, "HIDE");
assert.ok(negativeEvTrend.warnings.some((warning) => warning.includes("negative EV")));

const missingClvMarketTrend = assessTrendQuality({
  id: "missing-clv-market",
  market: "spread",
  sampleSize: 260,
  hitRate: 59,
  roi: 11,
  currentOddsAmerican: -110,
  marketBreadth: 3,
  filterCount: 2,
  seasonCount: 4,
  teamScopeCount: 18,
  source: "market-edge"
});
assert.ok(tierRank(missingClvMarketTrend.quality.tier) <= tierRank("B"));
assert.ok(missingClvMarketTrend.warnings.some((warning) => warning.includes("No closing-line-value support")));

const thinBookTrend = assessTrendQuality({
  id: "thin-books",
  market: "total",
  sampleSize: 260,
  hitRate: 60,
  roi: 12,
  currentOddsAmerican: -108,
  averageClv: 2,
  positiveClvRate: 64,
  marketBreadth: 1,
  filterCount: 2,
  seasonCount: 4,
  teamScopeCount: 18,
  source: "market-edge"
});
assert.equal(thinBookTrend.quality.tier, "C");
assert.equal(thinBookTrend.quality.actionability, "WATCHLIST");
assert.ok(thinBookTrend.gateReasons.some((reason) => reason.includes("Thin sportsbook coverage")));

const unstableRecentTrend = assessTrendQuality({
  id: "unstable-recent",
  market: "total",
  sampleSize: 260,
  hitRate: 61,
  recencyHitRate: 49,
  roi: 12,
  currentOddsAmerican: -108,
  averageClv: 2,
  positiveClvRate: 64,
  marketBreadth: 3,
  filterCount: 2,
  seasonCount: 4,
  teamScopeCount: 18,
  source: "market-edge"
});
assert.equal(unstableRecentTrend.quality.tier, "C");
assert.ok(unstableRecentTrend.warnings.some((warning) => warning.includes("Recent form drift")));

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
