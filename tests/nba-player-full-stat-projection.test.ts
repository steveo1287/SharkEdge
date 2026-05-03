import assert from "node:assert/strict";

import { projectNbaPlayerFullStatProfile } from "@/services/simulation/nba-player-full-stat-projection";

const recentStats = Array.from({ length: 12 }, (_, index) => ({
  MIN: 33 + (index % 3),
  PTS: 22 + (index % 5),
  REB: 8 + (index % 4),
  AST: 5 + (index % 3),
  FG3M: 2 + (index % 3),
  STL: 1 + (index % 2),
  BLK: index % 4 === 0 ? 2 : 1,
  TOV: 2 + (index % 2),
  FGA: 17 + (index % 5),
  FGM: 8 + (index % 3),
  FG3A: 6 + (index % 3),
  FTA: 5,
  FTM: 4,
  PF: 2,
  starter: true
}));

const noMarket = projectNbaPlayerFullStatProfile({
  playerId: "p-full",
  playerName: "Full Stat Player",
  team: "TOR",
  position: "F",
  recentStats,
  playerStatus: "ACTIVE"
});

assert.equal(noMarket.playerId, "p-full");
assert.ok(noMarket.projectedMinutes >= 30);
assert.ok(noMarket.stats.points.mean > 10);
assert.ok(noMarket.stats.rebounds.mean > 4);
assert.ok(noMarket.stats.assists.mean > 2);
assert.ok(noMarket.stats.threes.mean > 1);
assert.ok(noMarket.stats.steals.mean > 0.4);
assert.ok(noMarket.stats.blocks.mean > 0.4);
assert.ok(noMarket.stats.turnovers.mean > 0.8);
assert.ok(noMarket.stats.pra.mean > noMarket.stats.points.mean + noMarket.stats.rebounds.mean);
assert.ok(noMarket.combos.pr.mean > noMarket.stats.points.mean);
assert.ok(noMarket.combos.pa.mean > noMarket.stats.points.mean);
assert.ok(noMarket.combos.ra.mean > noMarket.stats.rebounds.mean);

for (const projection of Object.values(noMarket.stats)) {
  assert.equal(projection.marketLine, null);
  assert.equal(projection.overProbability, null);
  assert.equal(projection.underProbability, null);
  assert.ok(projection.warnings.includes("missing market line"));
}

const withMarkets = projectNbaPlayerFullStatProfile({
  playerId: "p-full",
  playerName: "Full Stat Player",
  team: "TOR",
  position: "F",
  recentStats,
  playerStatus: "ACTIVE",
  marketLinesByStat: {
    points: { line: 23.5, overOdds: -110, underOdds: -110 },
    rebounds: { line: 8.5, overOdds: -115, underOdds: -105 },
    assists: { line: 5.5, overOdds: 100, underOdds: -120 },
    threes: { line: 2.5, overOdds: -105, underOdds: -115 },
    pr: { line: 32.5 },
    pa: { line: 29.5 },
    ra: { line: 14.5 }
  }
});

assert.equal(withMarkets.stats.points.marketLine, 23.5);
assert.equal(withMarkets.stats.rebounds.marketLine, 8.5);
assert.equal(withMarkets.stats.assists.marketLine, 5.5);
assert.equal(withMarkets.stats.threes.marketLine, 2.5);
assert.ok(typeof withMarkets.stats.points.overProbability === "number");
assert.ok(typeof withMarkets.stats.rebounds.overProbability === "number");
assert.ok(typeof withMarkets.stats.assists.overProbability === "number");
assert.ok(typeof withMarkets.stats.threes.overProbability === "number");
assert.equal(withMarkets.combos.pr.marketLine, 32.5);
assert.equal(withMarkets.combos.pa.marketLine, 29.5);
assert.equal(withMarkets.combos.ra.marketLine, 14.5);
assert.ok(typeof withMarkets.combos.pr.overProbability === "number");
assert.ok(typeof withMarkets.combos.pa.overProbability === "number");
assert.ok(typeof withMarkets.combos.ra.overProbability === "number");

console.log("nba-player-full-stat-projection.test.ts passed");
