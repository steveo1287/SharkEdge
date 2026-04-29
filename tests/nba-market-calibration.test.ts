import assert from "node:assert/strict";

import {
  extractConsensusSpreadHome,
  normalizeHomeSpreadMarketPoint,
  robustConsensus
} from "@/services/simulation/nba-market-calibration";

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

// Outliers should not bend consensus enough to create fake edges.
const consensus = robustConsensus([6.5, 6.5, 7, 25]);
assert.equal(consensus.usedCount, 3);
assert.equal(consensus.rejectedCount, 1);
assert.equal(Number(consensus.value?.toFixed(2)), 6.67);

const event = {
  sport_key: "basketball_nba",
  home_team: "Home",
  away_team: "Away",
  bookmakers: [
    {
      key: "book_a",
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Home", point: -6.5, price: -110 },
            { name: "Away", point: 6.5, price: -110 }
          ]
        }
      ]
    },
    {
      key: "book_b",
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Home", point: -7, price: -110 },
            { name: "Away", point: 7, price: -110 }
          ]
        }
      ]
    },
    {
      key: "book_c_bad_pair",
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Home", point: -6.5, price: -110 },
            { name: "Away", point: 10.5, price: -110 }
          ]
        }
      ]
    },
    {
      key: "book_d_outlier",
      markets: [
        {
          key: "spreads",
          outcomes: [
            { name: "Home", point: -25, price: -110 },
            { name: "Away", point: 25, price: -110 }
          ]
        }
      ]
    }
  ]
};

const spreadConsensus = extractConsensusSpreadHome(event, "Home", "Away");
assert.equal(spreadConsensus.rejectedBookCount, 1);
assert.equal(spreadConsensus.outlierBookCount, 1);
assert.equal(spreadConsensus.usedBookCount, 2);
assert.equal(Number(spreadConsensus.value?.toFixed(2)), 6.75);

console.log("nba-market-calibration tests passed");
