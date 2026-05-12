import assert from "node:assert/strict";

import {
  buildMlbConsensusLine,
  isPlausibleMlbGameTotal,
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
assert.equal(isPlausibleMlbGameTotal(8.5), true);
assert.equal(isPlausibleMlbGameTotal(0.5), false);
assert.equal(isPlausibleMlbGameTotal(3.5), false);

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
    overPrice: -120,
    underPrice: 100,
    sportsbook: "Bad Hold Book"
  },
  {
    gameId: "g1",
    awayTeam: "Away",
    homeTeam: "Home",
    homeMoneyline: null,
    awayMoneyline: null,
    total: 0.5,
    overPrice: 390,
    underPrice: 900,
    sportsbook: "Derivative Total Masquerading As Game Total"
  }
], { home: "Home", away: "Away" });

assert.ok(consensus);
assert.equal(consensus!.moneylineSourceCount, 2);
assert.equal(consensus!.totalSourceCount, 3);
assert.equal(consensus!.total, 8.5);
assert.notEqual(consensus!.overPrice, 390);
assert.ok(consensus!.warnings.some((warning: string) => warning.includes("Rejected high-hold moneyline")));
assert.ok(consensus!.warnings.some((warning: string) => warning.includes("Rejected implausible or alternate MLB full-game totals")));
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
assert.ok(thinConsensus!.warnings.some((warning: string) => warning.includes("Moneyline consensus thin")));
assert.ok(thinConsensus!.warnings.some((warning: string) => warning.includes("Total consensus thin")));

const badTotalConsensus = buildMlbConsensusLine([
  {
    gameId: "g3",
    awayTeam: "Away",
    homeTeam: "Home",
    homeMoneyline: -130,
    awayMoneyline: 115,
    total: 1.5,
    overPrice: -110,
    underPrice: -110,
    sportsbook: "Runline Shaped Total"
  }
], { home: "Home", away: "Away" });
assert.ok(badTotalConsensus);
assert.equal(badTotalConsensus!.total, null);
assert.equal(badTotalConsensus!.overPrice, null);
assert.equal(badTotalConsensus!.underPrice, null);
assert.equal(badTotalConsensus!.totalSourceCount, 0);

const alternateTotalConsensus = buildMlbConsensusLine([
  {
    gameId: "g4",
    awayTeam: "Away",
    homeTeam: "Home",
    homeMoneyline: -120,
    awayMoneyline: 105,
    total: 12.5,
    overPrice: 390,
    underPrice: null,
    sportsbook: "Alt Total Ladder"
  }
], { home: "Home", away: "Away" });
assert.ok(alternateTotalConsensus);
assert.equal(alternateTotalConsensus!.total, null);
assert.equal(alternateTotalConsensus!.totalSourceCount, 0);

// A 6% no-vig moneyline edge should outrank a 1-run total edge after unit normalization.
assert.ok(rankMlbMarketSignal({ market: "home_ml", edge: 0.06 }) > rankMlbMarketSignal({ market: "over", edge: 1.0 }));

// A 1.5-run total edge should clear the strong-total threshold and outrank a 3% ML lean.
assert.ok(rankMlbMarketSignal({ market: "under", edge: 1.5 }) > rankMlbMarketSignal({ market: "away_ml", edge: 0.03 }));

console.log("mlb-edge-detector tests passed");
