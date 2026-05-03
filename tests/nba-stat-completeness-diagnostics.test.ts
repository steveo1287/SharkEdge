import assert from "node:assert/strict";

import { diagnoseNbaStatCompleteness } from "@/services/simulation/nba-player-stat-diagnostics";
import { projectNbaPlayerFullStatProfile } from "@/services/simulation/nba-player-full-stat-projection";

const collapse = diagnoseNbaStatCompleteness({
  projectedMinutes: 32,
  stats: {
    points: { mean: 18, warnings: [], blockers: [] },
    rebounds: { mean: 0, warnings: [], blockers: [] },
    assists: { mean: 0, warnings: [], blockers: [] },
    threes: { mean: 0, warnings: [], blockers: [] },
    steals: { mean: 0, warnings: [], blockers: [] },
    blocks: { mean: 0, warnings: [], blockers: [] },
    turnovers: { mean: 0, warnings: [], blockers: [] },
    pra: { mean: 18, warnings: [], blockers: [] }
  }
});

assert.equal(collapse.degraded, true);
assert.ok(collapse.blockers.includes("stat family collapse suspected"));
assert.ok(collapse.blockers.includes("non-point stat projection collapse suspected"));
assert.ok(collapse.warnings.includes("rebound projection suspiciously low"));
assert.ok(collapse.warnings.includes("assist projection suspiciously low"));
assert.ok(collapse.warnings.includes("turnover projection suspiciously low"));

const healthy = diagnoseNbaStatCompleteness({
  projectedMinutes: 32,
  stats: {
    points: { mean: 18, warnings: [], blockers: [] },
    rebounds: { mean: 7, warnings: [], blockers: [] },
    assists: { mean: 5, warnings: [], blockers: [] },
    threes: { mean: 2, warnings: [], blockers: [] },
    steals: { mean: 1, warnings: [], blockers: [] },
    blocks: { mean: 0.7, warnings: [], blockers: [] },
    turnovers: { mean: 2.5, warnings: [], blockers: [] },
    pra: { mean: 30, warnings: [], blockers: [] }
  }
});

assert.equal(healthy.degraded, false);
assert.deepEqual(healthy.blockers, []);
assert.deepEqual(healthy.warnings, []);

const brokenProfile = projectNbaPlayerFullStatProfile({
  playerId: "broken",
  playerName: "Broken Player",
  team: "NBA",
  recentStats: Array.from({ length: 10 }, () => ({ minutes: 32, points: 18 })),
  playerStatus: "ACTIVE"
});

assert.equal(brokenProfile.noBet, true);
assert.ok(brokenProfile.blockers.includes("stat family collapse suspected"));
assert.ok(brokenProfile.blockers.includes("non-point stat projection collapse suspected"));
assert.ok(brokenProfile.confidence <= 0.35);

const goodProfile = projectNbaPlayerFullStatProfile({
  playerId: "good",
  playerName: "Good Player",
  team: "NBA",
  recentStats: Array.from({ length: 10 }, (_, index) => ({
    minutes: 32,
    points: 18 + (index % 4),
    rebounds: 7 + (index % 3),
    assists: 5 + (index % 2),
    threes: 2,
    steals: 1,
    blocks: 1,
    turnovers: 2,
    fieldGoalsAttempted: 14,
    threePointAttempts: 5,
    freeThrowsAttempted: 4,
    starter: true
  })),
  playerStatus: "ACTIVE"
});

assert.equal(goodProfile.blockers.includes("stat family collapse suspected"), false);
assert.equal(goodProfile.blockers.includes("non-point stat projection collapse suspected"), false);
assert.ok(goodProfile.stats.rebounds.mean > 3);
assert.ok(goodProfile.stats.assists.mean > 2);
assert.ok(goodProfile.stats.threes.mean > 1);
assert.ok(goodProfile.stats.steals.mean > 0.5);
assert.ok(goodProfile.stats.blocks.mean > 0.5);

console.log("nba-stat-completeness-diagnostics.test.ts passed");
