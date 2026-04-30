import assert from "node:assert/strict";

import {
  buildMlbConsensusLine,
  noVigMoneylineProbabilities,
  rankMlbMarketSignal
} from "@/services/simulation/mlb-edge-detector";

const noVig = noVigMoneylineProbabilities(-150, 130);
assert.ok(noVig);
assert.equal(Number(noVig!.home.toFixed(4)), 0.5798);
assert.equal(Number(noVig!.away.toFixed(4)), 0.4202);
assert.equal(Number(noVig!.hold.toFixed(4)), 0.0348);

assert.equal(noVigMoneylineProbabilities(-150, null), null);
assert.equal(noVigMoneylineProbabilities(0, 120), null);

const consensus = buildMlbConsensusLine([
  {
    gameId: "g1",
    awayTeam: "Away",
    homeTeam: "Home",
    homeMoneyline: -150,
    awayMoneyline: 130,
    total: 8.5,
    overPrice: -110,
    underPrice: -110,
    sportsbook: "Book A"
  },
  {
    gameId: "g1",
    awayTeam: "Away",
    homeTeam: "Home",
    homeMoneyline: -145,
    awayMoneyline: 125,
    total: 8.5,
    overPrice: -108,
    underPrice: -112,
    sportsbook: "Book B"
  },
  {
    gameId: "g1",
    awayTeam: "Away",
    homeTeam: "Home",
    homeMoneyline: -900,
    awayMoneyline: 100,
    total: 12.5,
    overPrice: -500,
    underPrice: -500,
    sportsbook: "Bad Hold Book"
  }
], { home: "Home", away: "Away" });

assert.ok(consensus);
assert.equal(consensus!.moneylineSourceCount, 2);
assert.equal(consensus!.totalSourceCount, 3);
assert.equal(consensus!.total, 8.5);
assert.ok(consensus!.warnings.some((warning) => warning.includes("Rejected high-hold moneyline")));
assert.ok(consensus!.warnings.some((warning) => warning.includes("Rejected high-hold total")));
assert.ok(consensus!.homeNoVigProbability && consensus!.homeNoVigProbability > 0.57 && consensus!.homeNoVigProbability < 0.59);

const thinConsensus = buildMlbConsensusLine([
  {
    gameId: "g2",
    awayTeam: "Away",
    homeTeam: "Home",
    homeMoneyline: -120,
    awayMoneyline: 110,
    total: 7.5,
    overPrice: -110,
    underPrice: -110,
    sportsbook: "Solo Book"
  }
], { home: "Home", away: "Away" });
assert.ok(thinConsensus);
assert.equal(thinConsensus!.moneylineSourceCount, 1);
assert.ok(thinConsensus!.warnings.some((warning) => warning.includes("Moneyline consensus thin")));
assert.ok(thinConsensus!.warnings.some((warning) => warning.includes("Total consensus thin")));

// A 6% no-vig moneyline edge should outrank a 1-run total edge after unit normalization.
assert.ok(rankMlbMarketSignal({ market: "home_ml", edge: 0.06 }) > rankMlbMarketSignal({ market: "over", edge: 1.0 }));

// A 1.5-run total edge should clear the strong-total threshold and outrank a 3% ML lean.
assert.ok(rankMlbMarketSignal({ market: "under", edge: 1.5 }) > rankMlbMarketSignal({ market: "away_ml", edge: 0.03 }));

console.log("mlb-edge-detector tests passed");
