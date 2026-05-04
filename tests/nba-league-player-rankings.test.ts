import assert from "node:assert/strict";

import { buildNbaLeaguePlayerRankingUniverse } from "@/services/simulation/nba-league-player-rankings";
import { buildNbaEnhancedPlayerTeamRankingSnapshot } from "@/services/simulation/nba-enhanced-player-team-rankings";
import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";

function player(args: Partial<NbaPlayerStatProjection> & Pick<NbaPlayerStatProjection, "playerName" | "teamName" | "teamSide" | "projectedMinutes" | "projectedPoints" | "projectedRebounds" | "projectedAssists" | "projectedThrees">): NbaPlayerStatProjection {
  return {
    status: "available",
    floor: { points: 0, rebounds: 0, assists: 0, threes: 0 },
    median: { points: args.projectedPoints, rebounds: args.projectedRebounds, assists: args.projectedAssists, threes: args.projectedThrees },
    ceiling: { points: args.projectedPoints + 8, rebounds: args.projectedRebounds + 4, assists: args.projectedAssists + 4, threes: args.projectedThrees + 2 },
    confidence: 0.82,
    simulationRuns: 2000,
    propHitProbabilities: {},
    whyLikely: [],
    whyNotLikely: [],
    source: "test",
    ...args
  };
}

const projectedPlayers = [
  player({ playerName: "Home Alpha", teamName: "Home", teamSide: "home", projectedMinutes: 37, projectedPoints: 34, projectedRebounds: 8, projectedAssists: 10, projectedThrees: 4 }),
  player({ playerName: "Home Star", teamName: "Home", teamSide: "home", projectedMinutes: 34, projectedPoints: 25, projectedRebounds: 7, projectedAssists: 5, projectedThrees: 3 }),
  player({ playerName: "Home Role", teamName: "Home", teamSide: "home", projectedMinutes: 25, projectedPoints: 10, projectedRebounds: 5, projectedAssists: 2, projectedThrees: 2 }),
  player({ playerName: "Away Star", teamName: "Away", teamSide: "away", projectedMinutes: 35, projectedPoints: 24, projectedRebounds: 6, projectedAssists: 5, projectedThrees: 2 }),
  player({ playerName: "Away Role", teamName: "Away", teamSide: "away", projectedMinutes: 25, projectedPoints: 9, projectedRebounds: 4, projectedAssists: 2, projectedThrees: 1 })
];

const universe = await buildNbaLeaguePlayerRankingUniverse({ projectedPlayers, bypassCache: true });
assert.equal(universe.modelVersion, "nba-league-player-rankings-v1");
assert.ok(universe.playerCount >= projectedPlayers.length);
const homeAlpha = universe.players.find((row) => row.playerName === "Home Alpha");
assert.ok(homeAlpha);
assert.ok(homeAlpha!.categories.some((category) => category.category === "steals"));
assert.ok(homeAlpha!.categories.some((category) => category.category === "blocks"));
assert.ok(homeAlpha!.categories.some((category) => category.category === "turnovers"));
assert.ok(homeAlpha!.categories.some((category) => category.category === "trueShooting"));
assert.ok(homeAlpha!.leaguePercentile >= 0);
assert.ok(homeAlpha!.roleAdjustedPercentile >= 0);

const enhanced = await buildNbaEnhancedPlayerTeamRankingSnapshot({
  homeTeam: "Home",
  awayTeam: "Away",
  playerStatProjections: projectedPlayers
});
assert.ok(enhanced.players.some((row) => row.playerName === "Home Alpha" && row.leagueOverallRank !== null));
assert.ok(enhanced.drivers.some((driver) => driver.includes("league universe")));
assert.ok(["GREEN", "YELLOW", "RED"].includes(enhanced.leagueUniverseStatus));

console.log("nba-league-player-rankings.test.ts passed");
