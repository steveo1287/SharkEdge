import assert from "node:assert/strict";

import { normalizeNbaPlayerGameStat } from "@/services/simulation/nba-player-stat-normalizer";
import { buildNbaPlayerStatProfile } from "@/services/simulation/nba-player-stat-profile";
import { projectNbaPlayerStat } from "@/services/simulation/nba-player-stat-projection";

const normalized = normalizeNbaPlayerGameStat({
  MIN: "34:12",
  PTS: 22,
  REB: 8,
  AST: 6,
  FG3M: 3,
  STL: 2,
  BLK: 1,
  TOV: 4,
  FGA: 17,
  FGM: 8,
  FG3A: 7,
  FTA: 5,
  FTM: 4,
  PF: 2,
  starter: "starter"
});

assert.equal(Number(normalized.minutes.toFixed(2)), 34.2);
assert.equal(normalized.points, 22);
assert.equal(normalized.rebounds, 8);
assert.equal(normalized.assists, 6);
assert.equal(normalized.threes, 3);
assert.equal(normalized.steals, 2);
assert.equal(normalized.blocks, 1);
assert.equal(normalized.turnovers, 4);
assert.equal(normalized.fieldGoalsAttempted, 17);
assert.equal(normalized.threePointAttempts, 7);
assert.equal(normalized.freeThrowsAttempted, 5);
assert.equal(normalized.freeThrowsMade, 4);
assert.equal(normalized.personalFouls, 2);
assert.equal(normalized.starter, true);

const nested = normalizeNbaPlayerGameStat({
  minutes: 2112,
  statsJson: {
    points: "18",
    totalRebounds: "11",
    assists: "4",
    threePointMade: "2",
    steals: "1",
    blocks: "3",
    turnovers: "2"
  }
});

assert.equal(nested.minutes, 35.2);
assert.equal(nested.points, 18);
assert.equal(nested.rebounds, 11);
assert.equal(nested.assists, 4);
assert.equal(nested.threes, 2);
assert.equal(nested.steals, 1);
assert.equal(nested.blocks, 3);
assert.equal(nested.turnovers, 2);

const recentStats = Array.from({ length: 12 }, (_, index) => ({
  MIN: 32 + (index % 3),
  PTS: 20 + (index % 6),
  REB: 7 + (index % 4),
  AST: 5 + (index % 3),
  FG3M: 2 + (index % 2),
  STL: 1 + (index % 2),
  BLK: index % 3 === 0 ? 2 : 1,
  TOV: 2 + (index % 2),
  FGA: 16 + (index % 4),
  FGM: 8 + (index % 3),
  FG3A: 6 + (index % 2),
  FTA: 5,
  FTM: 4,
  PF: 2,
  starter: true
}));

const profile = buildNbaPlayerStatProfile({
  playerId: "p-normalized",
  playerName: "Normalized Player",
  team: "TOR",
  recentStats
});

assert.equal(profile.sampleSize, 12);
assert.ok(profile.statRatesPerMinute.points > 0.5);
assert.ok(profile.statRatesPerMinute.rebounds > 0.2);
assert.ok(profile.statRatesPerMinute.assists > 0.1);
assert.ok(profile.statRatesPerMinute.threes > 0.05);
assert.ok(profile.statRatesPerMinute.steals > 0.02);
assert.ok(profile.statRatesPerMinute.blocks > 0.02);
assert.ok(profile.statRatesPerMinute.turnovers > 0.04);
assert.ok(!profile.warnings.includes("stat normalization failure suspected"));

const reboundProjection = projectNbaPlayerStat({
  playerId: "p-normalized",
  playerName: "Normalized Player",
  team: "TOR",
  statKey: "rebounds",
  recentStats,
  marketLine: null,
  playerStatus: "ACTIVE"
});
const assistProjection = projectNbaPlayerStat({
  playerId: "p-normalized",
  playerName: "Normalized Player",
  team: "TOR",
  statKey: "assists",
  recentStats,
  marketLine: null,
  playerStatus: "ACTIVE"
});
const threesProjection = projectNbaPlayerStat({
  playerId: "p-normalized",
  playerName: "Normalized Player",
  team: "TOR",
  statKey: "threes",
  recentStats,
  marketLine: null,
  playerStatus: "ACTIVE"
});
const stealsProjection = projectNbaPlayerStat({
  playerId: "p-normalized",
  playerName: "Normalized Player",
  team: "TOR",
  statKey: "steals",
  recentStats,
  marketLine: null,
  playerStatus: "ACTIVE"
});
const blocksProjection = projectNbaPlayerStat({
  playerId: "p-normalized",
  playerName: "Normalized Player",
  team: "TOR",
  statKey: "blocks",
  recentStats,
  marketLine: null,
  playerStatus: "ACTIVE"
});

assert.ok(reboundProjection.mean > 4, `rebound mean was ${reboundProjection.mean}`);
assert.ok(assistProjection.mean > 2, `assist mean was ${assistProjection.mean}`);
assert.ok(threesProjection.mean > 1, `threes mean was ${threesProjection.mean}`);
assert.ok(stealsProjection.mean > 0.4, `steals mean was ${stealsProjection.mean}`);
assert.ok(blocksProjection.mean > 0.4, `blocks mean was ${blocksProjection.mean}`);

const brokenProfile = buildNbaPlayerStatProfile({
  playerId: "p-broken",
  playerName: "Broken Feed Player",
  recentStats: Array.from({ length: 8 }, () => ({ minutes: 30, points: 18 }))
});
assert.ok(brokenProfile.warnings.includes("stat normalization failure suspected"));

console.log("nba-player-stat-normalizer.test.ts passed");
