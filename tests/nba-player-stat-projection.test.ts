import assert from "node:assert/strict";

import { buildNbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import { projectNbaPlayerStat } from "@/services/simulation/nba-player-stat-projection";
import type { NbaLineupImpact } from "@/services/simulation/nba-player-impact";

function cleanImpact(teamName: string): NbaLineupImpact {
  return {
    teamName,
    players: [
      {
        playerName: `${teamName} Starter`,
        teamName,
        status: "available",
        minutesImpact: 32,
        usageImpact: 5,
        netRatingImpact: 2,
        offensiveImpact: 1.3,
        defensiveImpact: 0.7,
        volatilityImpact: 0.4,
        source: "real"
      }
    ],
    availabilityPenalty: 0,
    offensivePenalty: 0,
    defensivePenalty: 0,
    usageShock: 0,
    volatilityBoost: 1,
    activeCoreHealth: 100,
    summary: "Lineup impact is light."
  };
}

const lineupTruth = buildNbaLineupTruth({
  awayTeam: "Away",
  homeTeam: "Home",
  awayImpact: cleanImpact("Away"),
  homeImpact: cleanImpact("Home"),
  feedLastUpdatedAt: "2026-05-03T17:30:00.000Z",
  now: "2026-05-03T18:00:00.000Z",
  gameTime: "2026-05-03T20:00:00.000Z",
  projectionModules: [{ label: "Rotation availability", status: "real" }],
  projectionReasons: ["rotation minutes confirmed"],
  volatilityIndex: 1.1
});

const recentStats = Array.from({ length: 12 }, (_, index) => ({
  minutes: 33 + (index % 3),
  starter: true,
  points: 24 + (index % 5),
  rebounds: 6 + (index % 3),
  assists: 5 + (index % 4),
  threes: 3 + (index % 2),
  steals: index % 2,
  blocks: index % 3 === 0 ? 1 : 0,
  turnovers: 2 + (index % 2),
  fieldGoalsAttempted: 18 + (index % 4),
  fieldGoalsMade: 9 + (index % 3),
  freeThrowsAttempted: 5 + (index % 2),
  freeThrowsMade: 4 + (index % 2),
  threePointAttempts: 8 + (index % 2),
  offensiveRebounds: 1,
  defensiveRebounds: 5 + (index % 3),
  personalFouls: 2
}));

const points = projectNbaPlayerStat({
  playerId: "p1",
  playerName: "Home Star",
  team: "Home",
  statKey: "points",
  recentStats,
  lineupTruth,
  marketLine: 25.5,
  playerStatus: "ACTIVE",
  teamSpread: -3.5
});

assert.equal(points.noBet, false);
assert.ok(points.mean > 22);
assert.ok(points.mean < 30);
assert.ok(points.overProbability !== null && points.overProbability > 0.35 && points.overProbability < 0.75);
assert.ok(points.confidence >= 0.7);
assert.ok(points.minutes.projectedMinutes >= 30);
assert.ok(points.drivers.some((driver) => driver.includes("projected minutes")));

const questionable = projectNbaPlayerStat({
  playerId: "p1",
  playerName: "Home Star",
  team: "Home",
  statKey: "points",
  recentStats,
  lineupTruth,
  marketLine: 25.5,
  playerStatus: "QUESTIONABLE",
  teamSpread: -3.5
});

assert.equal(questionable.noBet, true);
assert.ok(questionable.blockers.some((blocker) => blocker.includes("QUESTIONABLE")));
assert.ok(questionable.minutes.injuryRisk >= 0.5);

const lowSample = projectNbaPlayerStat({
  playerId: "bench1",
  playerName: "Bench Guy",
  team: "Home",
  statKey: "rebounds",
  recentStats: recentStats.slice(0, 3).map((row) => ({ ...row, minutes: 9, rebounds: 2, starter: false })),
  lineupTruth,
  marketLine: 4.5,
  playerStatus: "ACTIVE",
  teamSpread: 14
});

assert.equal(lowSample.noBet, true);
assert.ok(lowSample.blockers.some((blocker) => blocker.includes("minutes confidence") || blocker.includes("low player stat sample")));
assert.ok(lowSample.minutes.blowoutRisk > 0);

const boosted = projectNbaPlayerStat({
  playerId: "p1",
  playerName: "Home Star",
  team: "Home",
  statKey: "points",
  recentStats,
  lineupTruth,
  marketLine: 25.5,
  playerStatus: "ACTIVE",
  teammateOutUsageImpact: 8,
  teamSpread: -3.5
});

assert.equal(boosted.noBet, false);
assert.ok(boosted.usage.usageMultiplier > points.usage.usageMultiplier);
assert.ok(boosted.mean >= points.mean);
assert.ok(boosted.drivers.some((driver) => driver.includes("vacated usage")));

const threes = projectNbaPlayerStat({
  playerId: "p1",
  playerName: "Home Star",
  team: "Home",
  statKey: "threes",
  recentStats,
  lineupTruth,
  marketLine: 2.5,
  playerStatus: "ACTIVE"
});

assert.equal(threes.noBet, false);
assert.ok(threes.overProbability !== null && threes.overProbability >= 0 && threes.overProbability <= 1);
assert.ok(threes.stdDev > 0);

console.log("nba-player-stat-projection.test.ts passed");
