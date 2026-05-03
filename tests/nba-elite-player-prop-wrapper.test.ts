import assert from "node:assert/strict";

import { buildNbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import type { NbaLineupImpact } from "@/services/simulation/nba-player-impact";
import { simulatePlayerPropProjection } from "@/services/simulation/player-prop-sim";

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
  fieldGoalsAttempted: 18 + (index % 4),
  fieldGoalsMade: 9 + (index % 3),
  freeThrowsAttempted: 5 + (index % 2),
  freeThrowsMade: 4 + (index % 2),
  threePointAttempts: 8 + (index % 2),
  offensiveRebounds: 1,
  defensiveRebounds: 5 + (index % 3),
  turnovers: 2,
  personalFouls: 2
}));

const active = simulatePlayerPropProjection({
  leagueKey: "NBA",
  statKey: "player_points",
  playerId: "p1",
  playerName: "Home Star",
  position: "G",
  recentStats,
  marketLine: 25.5,
  marketOddsOver: -110,
  marketOddsUnder: -110,
  teamStyle: {
    teamName: "Home",
    pace: 100,
    paceDelta: 1,
    offensePressure: 58,
    defenseResistance: 52,
    efficiency: 56,
    shotVolume: 58,
    possessionControl: 51,
    volatility: 45,
    notes: []
  },
  opponentStyle: {
    teamName: "Away",
    pace: 99,
    paceDelta: 0,
    offensePressure: 52,
    defenseResistance: 50,
    efficiency: 51,
    shotVolume: 51,
    possessionControl: 50,
    volatility: 45,
    notes: []
  },
  nbaLineupTruth: lineupTruth,
  playerStatus: "ACTIVE"
});

assert.ok(active.drivers[0].includes("NBA elite player-stat projection active"));
assert.ok(active.projectedMinutes != null && active.projectedMinutes >= 30);
assert.ok(active.sampleSize === 12);
assert.ok(active.hitProbOver["25.5"] >= 0 && active.hitProbOver["25.5"] <= 1);
assert.ok(active.sourceSummary.includes("Elite NBA prop model"));

const missingLineup = simulatePlayerPropProjection({
  leagueKey: "NBA",
  statKey: "player_points",
  playerId: "p1",
  playerName: "Home Star",
  position: "G",
  recentStats,
  marketLine: 25.5,
  marketOddsOver: -110,
  marketOddsUnder: -110,
  playerStatus: "ACTIVE"
});

assert.ok(missingLineup.drivers.some((driver) => driver.includes("Prop blocker: lineup truth missing")));
assert.ok(missingLineup.sourceSummary.includes("blocked action"));

const questionable = simulatePlayerPropProjection({
  leagueKey: "NBA",
  statKey: "player_points",
  playerId: "p1",
  playerName: "Home Star",
  position: "G",
  recentStats,
  marketLine: 25.5,
  marketOddsOver: -110,
  marketOddsUnder: -110,
  nbaLineupTruth: lineupTruth,
  playerStatus: "QUESTIONABLE"
});

assert.ok(questionable.drivers.some((driver) => driver.includes("Prop blocker: player status QUESTIONABLE")));
assert.ok(questionable.sourceSummary.includes("blocked action"));

const mlb = simulatePlayerPropProjection({
  leagueKey: "MLB",
  statKey: "player_points",
  playerId: "p2",
  playerName: "Non NBA Player",
  recentStats,
  marketLine: 1.5
});

assert.ok(!mlb.drivers[0]?.includes("NBA elite player-stat projection active"));

console.log("nba-elite-player-prop-wrapper.test.ts passed");
