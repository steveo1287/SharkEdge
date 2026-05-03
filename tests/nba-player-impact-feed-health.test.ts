import assert from "node:assert/strict";

import { classifyNbaPlayerImpactFeedHealth, type NbaPlayerImpactSnapshot } from "@/services/simulation/nba-player-impact";

const now = new Date("2026-05-03T18:00:00.000Z");

function snapshot(args: { teams?: number; playersPerTeam?: number; lastUpdatedAt?: string | null }): NbaPlayerImpactSnapshot {
  const teams: NbaPlayerImpactSnapshot["teams"] = {};
  const teamCount = args.teams ?? 30;
  const playersPerTeam = args.playersPerTeam ?? 6;
  for (let teamIndex = 0; teamIndex < teamCount; teamIndex += 1) {
    const teamName = `Team ${teamIndex}`;
    teams[teamName.toUpperCase()] = Array.from({ length: playersPerTeam }, (_, playerIndex) => ({
      playerName: `${teamName} Player ${playerIndex}`,
      teamName,
      status: "available",
      minutesImpact: 24,
      usageImpact: 3,
      netRatingImpact: 1.5,
      offensiveImpact: 0.8,
      defensiveImpact: 0.7,
      volatilityImpact: 0.5,
      source: "real"
    }));
  }
  return {
    teams,
    lastUpdatedAt: args.lastUpdatedAt ?? "2026-05-03T17:30:00.000Z"
  };
}

const missingUrl = classifyNbaPlayerImpactFeedHealth({
  snapshot: null,
  hasFeedUrl: false,
  configuredEnv: null,
  now
});
assert.equal(missingUrl.status, "RED");
assert.ok(missingUrl.blockers.some((blocker) => blocker.includes("not configured")));

const configuredNoRows = classifyNbaPlayerImpactFeedHealth({
  snapshot: null,
  hasFeedUrl: true,
  configuredEnv: "NBA_PLAYER_IMPACT_URL",
  now
});
assert.equal(configuredNoRows.status, "RED");
assert.ok(configuredNoRows.blockers.some((blocker) => blocker.includes("returned no usable players")));

const missingTimestamp = classifyNbaPlayerImpactFeedHealth({
  snapshot: snapshot({ lastUpdatedAt: null }),
  hasFeedUrl: true,
  configuredEnv: "NBA_PLAYER_IMPACT_URL",
  now
});
assert.equal(missingTimestamp.status, "RED");
assert.ok(missingTimestamp.blockers.some((blocker) => blocker.includes("no usable lastUpdatedAt")));

const stale = classifyNbaPlayerImpactFeedHealth({
  snapshot: snapshot({ lastUpdatedAt: "2026-05-03T15:00:00.000Z" }),
  hasFeedUrl: true,
  configuredEnv: "NBA_PLAYER_IMPACT_URL",
  now
});
assert.equal(stale.status, "RED");
assert.equal(stale.ageMinutes, 180);
assert.ok(stale.blockers.some((blocker) => blocker.includes("stale")));

const future = classifyNbaPlayerImpactFeedHealth({
  snapshot: snapshot({ lastUpdatedAt: "2026-05-03T19:00:00.000Z" }),
  hasFeedUrl: true,
  configuredEnv: "NBA_PLAYER_IMPACT_URL",
  now
});
assert.equal(future.status, "RED");
assert.ok(future.blockers.some((blocker) => blocker.includes("future")));

const smallCoverage = classifyNbaPlayerImpactFeedHealth({
  snapshot: snapshot({ teams: 6, playersPerTeam: 5, lastUpdatedAt: "2026-05-03T17:30:00.000Z" }),
  hasFeedUrl: true,
  configuredEnv: "NBA_PLAYER_IMPACT_URL",
  now
});
assert.equal(smallCoverage.status, "YELLOW");
assert.equal(smallCoverage.blockers.length, 0);
assert.ok(smallCoverage.warnings.some((warning) => warning.includes("only covers")));

const healthy = classifyNbaPlayerImpactFeedHealth({
  snapshot: snapshot({ teams: 30, playersPerTeam: 8, lastUpdatedAt: "2026-05-03T17:30:00.000Z" }),
  hasFeedUrl: true,
  configuredEnv: "NBA_PLAYER_IMPACT_URL",
  now
});
assert.equal(healthy.status, "GREEN");
assert.equal(healthy.feedFresh, true);
assert.equal(healthy.teamCount, 30);
assert.equal(healthy.playerCount, 240);
assert.equal(healthy.blockers.length, 0);
assert.equal(healthy.warnings.length, 0);

console.log("nba-player-impact-feed-health.test.ts passed");
