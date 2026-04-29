import assert from "node:assert/strict";

import { normalizeHomeSpreadMarketPoint } from "@/services/simulation/nba-market-calibration";

// Odds API spread points are sportsbook ticket notation. SharkEdge model spread
// is projected home margin. A home favorite -6.5 should be compared against a
// +6.5 home-margin threshold, not treated as -6.5.
assert.equal(normalizeHomeSpreadMarketPoint(-6.5), 6.5);
assert.equal(normalizeHomeSpreadMarketPoint(-1.5), 1.5);

// Home underdog +4.5 means the home side can lose by 4 and still cover, so the
// model comparison threshold is -4.5 home margin.
assert.equal(normalizeHomeSpreadMarketPoint(4.5), -4.5);

// Pick'em remains neutral.
assert.equal(normalizeHomeSpreadMarketPoint(0), -0);

// Invalid spread points should not enter market averages.
assert.equal(normalizeHomeSpreadMarketPoint(null), null);
assert.equal(normalizeHomeSpreadMarketPoint(undefined), null);
assert.equal(normalizeHomeSpreadMarketPoint(Number.NaN), null);

// Regression: model home by 6 vs home -6.5 should be a small negative edge,
// not a fake +12.5 spread edge.
const marketHomeMarginThreshold = normalizeHomeSpreadMarketPoint(-6.5);
assert.equal(marketHomeMarginThreshold, 6.5);
assert.equal(Number((6 - marketHomeMarginThreshold!).toFixed(2)), -0.5);

// Regression: model home by 6 vs home +4.5 should be a strong positive edge.
const homeDogThreshold = normalizeHomeSpreadMarketPoint(4.5);
assert.equal(homeDogThreshold, -4.5);
assert.equal(Number((6 - homeDogThreshold!).toFixed(2)), 10.5);

console.log("nba-market-calibration tests passed");
