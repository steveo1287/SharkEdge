import assert from "node:assert/strict";

import { buildNbaTeamStrengthRosterImpact } from "@/services/simulation/nba-team-strength-roster-impact";
import { buildNbaWinnerProbability } from "@/services/simulation/nba-winner-probability-engine";
import type { NbaNoVigMarket } from "@/services/simulation/nba-market-sanity";
import type { NbaLineupTruth } from "@/services/simulation/nba-lineup-truth";
import type { NbaPlayerStatProjection } from "@/services/simulation/nba-player-stat-sim";

function player(args: Partial<NbaPlayerStatProjection> & Pick<NbaPlayerStatProjection, "playerName" | "teamName" | "teamSide" | "projectedMinutes" | "projectedPoints" | "projectedRebounds" | "projectedAssists" | "projectedThrees">): NbaPlayerStatProjection {
  return {
    status: "available",
    floor: { points: 0, rebounds: 0, assists: 0, threes: 0 },
    median: { points: args.projectedPoints, rebounds: args.projectedRebounds, assists: args.projectedAssists, threes: args.projectedThrees },
    ceiling: { points: args.projectedPoints + 8, rebounds: args.projectedRebounds + 4, assists: args.projectedAssists + 4, threes: args.projectedThrees + 2 },
    confidence: 0.78,
    simulationRuns: 2000,
    propHitProbabilities: {},
    whyLikely: [],
    whyNotLikely: [],
    source: "test",
    ...args
  };
}

const homeCore = [
  player({ playerName: "Home Star", teamName: "Home", teamSide: "home", projectedMinutes: 36, projectedPoints: 31, projectedRebounds: 8, projectedAssists: 9, projectedThrees: 4 }),
  player({ playerName: "Home Wing", teamName: "Home", teamSide: "home", projectedMinutes: 34, projectedPoints: 22, projectedRebounds: 7, projectedAssists: 4, projectedThrees: 3 }),
  player({ playerName: "Home Big", teamName: "Home", teamSide: "home", projectedMinutes: 31, projectedPoints: 17, projectedRebounds: 12, projectedAssists: 3, projectedThrees: 1 }),
  player({ playerName: "Home Guard", teamName: "Home", teamSide: "home", projectedMinutes: 29, projectedPoints: 15, projectedRebounds: 4, projectedAssists: 7, projectedThrees: 2 }),
  player({ playerName: "Home Bench 1", teamName: "Home", teamSide: "home", projectedMinutes: 22, projectedPoints: 10, projectedRebounds: 4, projectedAssists: 2, projectedThrees: 1 }),
  player({ playerName: "Home Bench 2", teamName: "Home", teamSide: "home", projectedMinutes: 19, projectedPoints: 8, projectedRebounds: 3, projectedAssists: 2, projectedThrees: 1 }),
  player({ playerName: "Home Bench 3", teamName: "Home", teamSide: "home", projectedMinutes: 15, projectedPoints: 6, projectedRebounds: 3, projectedAssists: 1, projectedThrees: 1 })
];

const awayCore = [
  player({ playerName: "Away Star", teamName: "Away", teamSide: "away", projectedMinutes: 35, projectedPoints: 24, projectedRebounds: 6, projectedAssists: 5, projectedThrees: 2 }),
  player({ playerName: "Away Wing", teamName: "Away", teamSide: "away", projectedMinutes: 32, projectedPoints: 16, projectedRebounds: 5, projectedAssists: 3, projectedThrees: 2 }),
  player({ playerName: "Away Big", teamName: "Away", teamSide: "away", projectedMinutes: 30, projectedPoints: 14, projectedRebounds: 9, projectedAssists: 2, projectedThrees: 0 }),
  player({ playerName: "Away Guard", teamName: "Away", teamSide: "away", projectedMinutes: 28, projectedPoints: 13, projectedRebounds: 3, projectedAssists: 5, projectedThrees: 2 }),
  player({ playerName: "Away Bench 1", teamName: "Away", teamSide: "away", projectedMinutes: 22, projectedPoints: 8, projectedRebounds: 3, projectedAssists: 2, projectedThrees: 1 }),
  player({ playerName: "Away Bench 2", teamName: "Away", teamSide: "away", projectedMinutes: 18, projectedPoints: 6, projectedRebounds: 3, projectedAssists: 1, projectedThrees: 1 }),
  player({ playerName: "Away Bench 3", teamName: "Away", teamSide: "away", projectedMinutes: 14, projectedPoints: 4, projectedRebounds: 2, projectedAssists: 1, projectedThrees: 0 })
];

const impact = buildNbaTeamStrengthRosterImpact({
  awayTeam: "Away",
  homeTeam: "Home",
  projectedHomeMargin: 1.5,
  projectedTotal: 228,
  homeWinPct: 0.54,
  awayWinPct: 0.46,
  playerStatProjections: [...homeCore, ...awayCore]
});

assert.equal(impact.modelVersion, "nba-team-strength-roster-impact-v1");
assert.ok(impact.homeTeam.overallPowerRating > impact.awayTeam.overallPowerRating);
assert.ok(impact.homeRoster[0].totalImpactPoints > impact.awayRoster[0].totalImpactPoints);
assert.ok(impact.finalProjectedHomeMargin > 1.5);
assert.ok(impact.boundedProbabilityDelta > 0);
assert.ok(impact.confidence > 0.5);

const market: NbaNoVigMarket = {
  available: true,
  source: "test",
  awayTeam: "Away",
  homeTeam: "Home",
  awayOddsAmerican: 100,
  homeOddsAmerican: -110,
  awayNoVigProbability: 0.488,
  homeNoVigProbability: 0.512,
  hold: 0.02,
  spreadLine: -1.5,
  awaySpreadOddsAmerican: -110,
  homeSpreadOddsAmerican: -110,
  totalLine: 228,
  overOddsAmerican: -110,
  underOddsAmerican: -110,
  overNoVigProbability: 0.5,
  underNoVigProbability: 0.5,
  totalHold: 0.0476
};

const lineup: NbaLineupTruth = {
  status: "GREEN",
  injuryReportFresh: true,
  minutesTrusted: true,
  projectedStarterConfidence: 0.93,
  starQuestionable: false,
  highUsageOut: false,
  lateScratchRisk: false,
  lastUpdatedAt: new Date().toISOString(),
  blockers: [],
  warnings: [],
  playerFlags: []
};

const winnerWithoutImpact = buildNbaWinnerProbability({
  rawHomeWinPct: 0.54,
  rawAwayWinPct: 0.46,
  projectedHomeMargin: 1.5,
  projectedTotal: 228,
  market,
  lineupTruth: lineup,
  sourceHealth: { team: true, player: true, history: true, rating: true, realModules: 4, requiredModulesReady: true },
  calibrationHealthy: true
});

const winnerWithImpact = buildNbaWinnerProbability({
  rawHomeWinPct: 0.54,
  rawAwayWinPct: 0.46,
  projectedHomeMargin: 1.5,
  projectedTotal: 228,
  market,
  lineupTruth: lineup,
  teamStrengthRosterImpact: impact,
  sourceHealth: { team: true, player: true, history: true, rating: true, realModules: 4, requiredModulesReady: true },
  calibrationHealthy: true
});

assert.ok(winnerWithImpact.finalHomeWinPct > winnerWithoutImpact.finalHomeWinPct);
assert.ok(winnerWithImpact.rosterImpactDelta > 0);
assert.ok(winnerWithImpact.drivers.some((driver) => driver.includes("roster/team delta")));

console.log("nba-team-strength-roster-impact.test.ts passed");
