import assert from "node:assert/strict";

import { buildNbaPlayerTeamRankingSnapshot } from "@/services/simulation/nba-player-team-rankings";
import { buildNbaRankedTeamStrengthRosterImpact } from "@/services/simulation/nba-ranked-team-strength-roster-impact";
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

const home = [
  player({ playerName: "Home Alpha", teamName: "Home", teamSide: "home", projectedMinutes: 37, projectedPoints: 33, projectedRebounds: 8, projectedAssists: 10, projectedThrees: 4 }),
  player({ playerName: "Home Star", teamName: "Home", teamSide: "home", projectedMinutes: 34, projectedPoints: 24, projectedRebounds: 7, projectedAssists: 5, projectedThrees: 3 }),
  player({ playerName: "Home Creator", teamName: "Home", teamSide: "home", projectedMinutes: 31, projectedPoints: 17, projectedRebounds: 4, projectedAssists: 8, projectedThrees: 2 }),
  player({ playerName: "Home Spacer", teamName: "Home", teamSide: "home", projectedMinutes: 27, projectedPoints: 12, projectedRebounds: 4, projectedAssists: 2, projectedThrees: 3 }),
  player({ playerName: "Home Big", teamName: "Home", teamSide: "home", projectedMinutes: 26, projectedPoints: 11, projectedRebounds: 10, projectedAssists: 2, projectedThrees: 0 }),
  player({ playerName: "Home Role", teamName: "Home", teamSide: "home", projectedMinutes: 20, projectedPoints: 8, projectedRebounds: 3, projectedAssists: 2, projectedThrees: 1 }),
  player({ playerName: "Home Bench", teamName: "Home", teamSide: "home", projectedMinutes: 14, projectedPoints: 5, projectedRebounds: 2, projectedAssists: 1, projectedThrees: 1 })
];

const away = [
  player({ playerName: "Away Star", teamName: "Away", teamSide: "away", projectedMinutes: 35, projectedPoints: 23, projectedRebounds: 6, projectedAssists: 5, projectedThrees: 2 }),
  player({ playerName: "Away Starter", teamName: "Away", teamSide: "away", projectedMinutes: 31, projectedPoints: 16, projectedRebounds: 5, projectedAssists: 3, projectedThrees: 2 }),
  player({ playerName: "Away Guard", teamName: "Away", teamSide: "away", projectedMinutes: 29, projectedPoints: 13, projectedRebounds: 3, projectedAssists: 5, projectedThrees: 2 }),
  player({ playerName: "Away Big", teamName: "Away", teamSide: "away", projectedMinutes: 27, projectedPoints: 12, projectedRebounds: 8, projectedAssists: 2, projectedThrees: 0 }),
  player({ playerName: "Away Role A", teamName: "Away", teamSide: "away", projectedMinutes: 22, projectedPoints: 8, projectedRebounds: 3, projectedAssists: 2, projectedThrees: 1 }),
  player({ playerName: "Away Role B", teamName: "Away", teamSide: "away", projectedMinutes: 18, projectedPoints: 6, projectedRebounds: 3, projectedAssists: 1, projectedThrees: 1 }),
  player({ playerName: "Away Bench", teamName: "Away", teamSide: "away", projectedMinutes: 12, projectedPoints: 4, projectedRebounds: 2, projectedAssists: 1, projectedThrees: 0 })
];

const snapshot = buildNbaPlayerTeamRankingSnapshot({ homeTeam: "Home", awayTeam: "Away", playerStatProjections: [...home, ...away] });
assert.equal(snapshot.modelVersion, "nba-player-team-rankings-v1");
assert.equal(snapshot.players.length, 14);
assert.equal(snapshot.players[0].playerName, "Home Alpha");
assert.equal(snapshot.players[0].rawOverallRank, 1);
assert.ok(snapshot.players[0].categories.some((category) => category.category === "points" && category.rawRank === 1));
assert.ok(snapshot.home.overallScore > snapshot.away.overallScore);
assert.ok(snapshot.home.starPowerScore > snapshot.away.starPowerScore);
assert.ok(snapshot.homeCompositeEdge > 0);
assert.ok(snapshot.boundedProbabilityDelta > 0);
assert.ok(snapshot.matchupEdges.some((edge) => edge.category === "starPower" && edge.winner === "HOME"));

const rankedImpact = buildNbaRankedTeamStrengthRosterImpact({
  awayTeam: "Away",
  homeTeam: "Home",
  projectedHomeMargin: 1,
  projectedTotal: 228,
  homeWinPct: 0.53,
  awayWinPct: 0.47,
  playerStatProjections: [...home, ...away]
});

assert.ok(rankedImpact.rankingSnapshot.homeCompositeEdge > 0);
assert.ok(rankedImpact.boundedProbabilityDelta >= rankedImpact.rankingSnapshot.boundedProbabilityDelta);
assert.ok(rankedImpact.drivers.some((driver) => driver.includes("ranking overlay delta")));

console.log("nba-player-team-rankings.test.ts passed");
