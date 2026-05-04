import assert from "node:assert/strict";

import { buildNbaPlayerRoleDepth } from "@/services/simulation/nba-player-role-depth";
import { buildNbaTeamStrengthRosterImpact } from "@/services/simulation/nba-team-strength-roster-impact";
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

const superstar = player({ playerName: "Superstar", teamName: "Home", teamSide: "home", projectedMinutes: 37, projectedPoints: 32, projectedRebounds: 8, projectedAssists: 10, projectedThrees: 4 });
const star = player({ playerName: "Star", teamName: "Home", teamSide: "home", projectedMinutes: 34, projectedPoints: 25, projectedRebounds: 7, projectedAssists: 5, projectedThrees: 3 });
const starter = player({ playerName: "Starter", teamName: "Home", teamSide: "home", projectedMinutes: 30, projectedPoints: 13, projectedRebounds: 5, projectedAssists: 3, projectedThrees: 2 });
const bench = player({ playerName: "Bench", teamName: "Home", teamSide: "home", projectedMinutes: 11, projectedPoints: 4, projectedRebounds: 2, projectedAssists: 1, projectedThrees: 0 });
const out = player({ playerName: "Out Star", teamName: "Away", teamSide: "away", projectedMinutes: 35, projectedPoints: 28, projectedRebounds: 7, projectedAssists: 7, projectedThrees: 3, status: "OUT" });

const superstarDepth = buildNbaPlayerRoleDepth(superstar);
assert.equal(superstarDepth.roleTier, "SUPERSTAR");
assert.equal(superstarDepth.usageTier, "ELITE_USAGE");
assert.ok(superstarDepth.starScore > 0.82);
assert.ok(superstarDepth.closingLineupScore > 0.8);

const starDepth = buildNbaPlayerRoleDepth(star);
assert.ok(starDepth.roleTier === "STAR" || starDepth.roleTier === "PRIMARY_CREATOR");
assert.ok(starDepth.starScore > 0.62);

const starterDepth = buildNbaPlayerRoleDepth(starter);
assert.ok(["STARTER", "ROTATION"].includes(starterDepth.roleTier));
assert.ok(starterDepth.rolePlayerScore > 0.45);

const benchDepth = buildNbaPlayerRoleDepth(bench);
assert.ok(["LOW_MIN_BENCH", "FRINGE", "ROTATION"].includes(benchDepth.roleTier));
assert.ok(benchDepth.starScore < 0.35);

const outDepth = buildNbaPlayerRoleDepth(out);
assert.equal(outDepth.roleTier, "OUT");
assert.equal(outDepth.archetype, "UNAVAILABLE");
assert.ok(outDepth.replacementRisk > 0.5);

const fillerHome = [
  superstar,
  star,
  starter,
  player({ playerName: "Role A", teamName: "Home", teamSide: "home", projectedMinutes: 25, projectedPoints: 10, projectedRebounds: 5, projectedAssists: 2, projectedThrees: 2 }),
  player({ playerName: "Role B", teamName: "Home", teamSide: "home", projectedMinutes: 21, projectedPoints: 8, projectedRebounds: 4, projectedAssists: 2, projectedThrees: 1 }),
  player({ playerName: "Role C", teamName: "Home", teamSide: "home", projectedMinutes: 17, projectedPoints: 6, projectedRebounds: 3, projectedAssists: 1, projectedThrees: 1 }),
  bench
];
const fillerAway = [
  out,
  player({ playerName: "Away Starter", teamName: "Away", teamSide: "away", projectedMinutes: 31, projectedPoints: 16, projectedRebounds: 6, projectedAssists: 3, projectedThrees: 2 }),
  player({ playerName: "Away Guard", teamName: "Away", teamSide: "away", projectedMinutes: 29, projectedPoints: 13, projectedRebounds: 3, projectedAssists: 5, projectedThrees: 2 }),
  player({ playerName: "Away Big", teamName: "Away", teamSide: "away", projectedMinutes: 27, projectedPoints: 12, projectedRebounds: 8, projectedAssists: 2, projectedThrees: 0 }),
  player({ playerName: "Away Role A", teamName: "Away", teamSide: "away", projectedMinutes: 22, projectedPoints: 8, projectedRebounds: 3, projectedAssists: 2, projectedThrees: 1 }),
  player({ playerName: "Away Role B", teamName: "Away", teamSide: "away", projectedMinutes: 18, projectedPoints: 6, projectedRebounds: 3, projectedAssists: 1, projectedThrees: 1 }),
  player({ playerName: "Away Bench", teamName: "Away", teamSide: "away", projectedMinutes: 12, projectedPoints: 4, projectedRebounds: 2, projectedAssists: 1, projectedThrees: 0 })
];

const impact = buildNbaTeamStrengthRosterImpact({
  awayTeam: "Away",
  homeTeam: "Home",
  projectedHomeMargin: 0,
  projectedTotal: 226,
  homeWinPct: 0.5,
  awayWinPct: 0.5,
  playerStatProjections: [...fillerHome, ...fillerAway]
});

assert.ok(impact.homeTeam.starCount >= 2);
assert.ok(impact.homeTeam.starPowerGrade > impact.awayTeam.starPowerGrade);
assert.ok(impact.homeRoster[0].roleTier === "SUPERSTAR" || impact.homeRoster[0].roleTier === "STAR");
assert.ok(impact.awayRoster.some((row) => row.roleTier === "OUT"));
assert.ok(impact.usageRedistribution.awayMissingStarScore > impact.usageRedistribution.homeMissingStarScore);
assert.ok(impact.drivers.some((driver) => driver.includes("home stars")));

console.log("nba-player-role-depth.test.ts passed");
