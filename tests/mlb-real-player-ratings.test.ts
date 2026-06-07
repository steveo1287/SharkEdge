import assert from "node:assert/strict";

import {
  buildMlbRealPlayerRatings,
  buildMlbTeamContextFromRealRatings,
  type MlbRawHitterStatRow,
  type MlbRawPitcherStatRow,
  type MlbTheShowRatingRow
} from "@/services/simulation/mlb-real-player-ratings";
import {
  projectMlbInningMarkets,
  projectMlbPlayerStatsForGame
} from "@/services/simulation/mlb-player-stat-inning-engine";

const hitterStats: MlbRawHitterStatRow[] = [
  { mlbId: 592450, name: "Aaron Judge", team: "NYY", position: "RF", bats: "R", plateAppearances: 704, atBats: 559, hits: 180, doubles: 36, triples: 1, homeRuns: 58, walks: 133, strikeouts: 171, stolenBases: 10, caughtStealing: 1, totalBases: 392, avg: 0.322, obp: 0.458, slg: 0.701, ops: 1.159, iso: 0.379, wrcPlus: 218, xba: 0.305, xslg: 0.682, xwoba: 0.476, barrelRate: 0.265, hardHitRate: 0.61, chaseRate: 0.205, whiffRate: 0.285, sprintSpeed: 27.2, last14Ops: 1.025 },
  { mlbId: 665742, name: "Juan Soto", team: "NYY", position: "LF", bats: "L", plateAppearances: 713, atBats: 576, hits: 166, doubles: 31, triples: 4, homeRuns: 41, walks: 129, strikeouts: 119, stolenBases: 7, caughtStealing: 4, totalBases: 328, avg: 0.288, obp: 0.419, slg: 0.569, ops: 0.988, iso: 0.281, wrcPlus: 180, xba: 0.285, xslg: 0.561, xwoba: 0.421, barrelRate: 0.19, hardHitRate: 0.57, chaseRate: 0.18, whiffRate: 0.198, sprintSpeed: 26.4, last14Ops: 0.912 },
  { mlbId: 650402, name: "Gleyber Torres", team: "NYY", position: "2B", bats: "R", plateAppearances: 665, atBats: 587, hits: 151, doubles: 26, triples: 0, homeRuns: 15, walks: 65, strikeouts: 136, stolenBases: 4, caughtStealing: 2, totalBases: 222, avg: 0.257, obp: 0.33, slg: 0.378, ops: 0.708, iso: 0.121, wrcPlus: 104, xba: 0.252, xslg: 0.39, xwoba: 0.32, barrelRate: 0.075, hardHitRate: 0.405, chaseRate: 0.274, whiffRate: 0.225, sprintSpeed: 27.0, last14Ops: 0.744 },
  { mlbId: 518934, name: "Giancarlo Stanton", team: "NYY", position: "DH", bats: "R", plateAppearances: 459, atBats: 417, hits: 95, doubles: 20, triples: 0, homeRuns: 27, walks: 37, strikeouts: 145, stolenBases: 0, caughtStealing: 0, totalBases: 196, avg: 0.228, obp: 0.298, slg: 0.47, ops: 0.768, iso: 0.242, wrcPlus: 116, xba: 0.24, xslg: 0.485, xwoba: 0.342, barrelRate: 0.18, hardHitRate: 0.55, chaseRate: 0.305, whiffRate: 0.34, sprintSpeed: 24.6, last14Ops: 0.811 },
  { mlbId: 624413, name: "Anthony Rizzo", team: "NYY", position: "1B", bats: "L", plateAppearances: 375, atBats: 337, hits: 77, doubles: 12, triples: 0, homeRuns: 8, walks: 33, strikeouts: 60, stolenBases: 0, caughtStealing: 0, totalBases: 113, avg: 0.228, obp: 0.301, slg: 0.335, ops: 0.636, iso: 0.107, wrcPlus: 82, xba: 0.245, xslg: 0.381, xwoba: 0.305, barrelRate: 0.06, hardHitRate: 0.39, chaseRate: 0.25, whiffRate: 0.18, sprintSpeed: 23.8, last14Ops: 0.682 },
  { mlbId: 643396, name: "Anthony Volpe", team: "NYY", position: "SS", bats: "R", plateAppearances: 689, atBats: 637, hits: 155, doubles: 27, triples: 7, homeRuns: 12, walks: 42, strikeouts: 156, stolenBases: 28, caughtStealing: 6, totalBases: 232, avg: 0.243, obp: 0.293, slg: 0.364, ops: 0.657, iso: 0.121, wrcPlus: 86, xba: 0.249, xslg: 0.391, xwoba: 0.303, barrelRate: 0.055, hardHitRate: 0.385, chaseRate: 0.292, whiffRate: 0.244, sprintSpeed: 28.5, last14Ops: 0.701 },
  { mlbId: 669224, name: "Austin Wells", team: "NYY", position: "C", bats: "L", plateAppearances: 414, atBats: 354, hits: 81, doubles: 18, triples: 1, homeRuns: 13, walks: 54, strikeouts: 102, stolenBases: 1, caughtStealing: 0, totalBases: 140, avg: 0.229, obp: 0.322, slg: 0.395, ops: 0.717, iso: 0.166, wrcPlus: 105, xba: 0.241, xslg: 0.433, xwoba: 0.326, barrelRate: 0.092, hardHitRate: 0.43, chaseRate: 0.242, whiffRate: 0.276, sprintSpeed: 25.1, last14Ops: 0.782 },
  { mlbId: 683011, name: "Jasson Dominguez", team: "NYY", position: "CF", bats: "S", plateAppearances: 200, atBats: 180, hits: 47, doubles: 9, triples: 2, homeRuns: 8, walks: 18, strikeouts: 54, stolenBases: 12, caughtStealing: 2, totalBases: 84, avg: 0.261, obp: 0.33, slg: 0.467, ops: 0.797, iso: 0.206, wrcPlus: 120, xba: 0.258, xslg: 0.451, xwoba: 0.341, barrelRate: 0.11, hardHitRate: 0.44, chaseRate: 0.288, whiffRate: 0.302, sprintSpeed: 28.3, last14Ops: 0.815 },
  { mlbId: 572761, name: "DJ LeMahieu", team: "NYY", position: "3B", bats: "R", plateAppearances: 250, atBats: 225, hits: 54, doubles: 9, triples: 0, homeRuns: 2, walks: 22, strikeouts: 42, stolenBases: 1, caughtStealing: 0, totalBases: 69, avg: 0.24, obp: 0.308, slg: 0.307, ops: 0.615, iso: 0.067, wrcPlus: 77, xba: 0.245, xslg: 0.335, xwoba: 0.292, barrelRate: 0.025, hardHitRate: 0.32, chaseRate: 0.245, whiffRate: 0.16, sprintSpeed: 25.7, last14Ops: 0.642 },

  { mlbId: 646240, name: "Rafael Devers", team: "BOS", position: "3B", bats: "L", plateAppearances: 601, atBats: 525, hits: 143, doubles: 34, triples: 5, homeRuns: 28, walks: 70, strikeouts: 141, stolenBases: 3, caughtStealing: 1, totalBases: 271, avg: 0.272, obp: 0.354, slg: 0.516, ops: 0.87, iso: 0.244, wrcPlus: 140, xba: 0.278, xslg: 0.54, xwoba: 0.374, barrelRate: 0.142, hardHitRate: 0.51, chaseRate: 0.29, whiffRate: 0.28, sprintSpeed: 26.0, last14Ops: 0.94 },
  { mlbId: 666139, name: "Jarren Duran", team: "BOS", position: "CF", bats: "L", plateAppearances: 735, atBats: 671, hits: 191, doubles: 48, triples: 14, homeRuns: 21, walks: 53, strikeouts: 160, stolenBases: 34, caughtStealing: 7, totalBases: 330, avg: 0.285, obp: 0.342, slg: 0.492, ops: 0.834, iso: 0.207, wrcPlus: 129, xba: 0.274, xslg: 0.465, xwoba: 0.354, barrelRate: 0.092, hardHitRate: 0.44, chaseRate: 0.31, whiffRate: 0.236, sprintSpeed: 29.1, last14Ops: 0.872 },
  { mlbId: 657077, name: "Triston Casas", team: "BOS", position: "1B", bats: "L", plateAppearances: 260, atBats: 220, hits: 53, doubles: 13, triples: 0, homeRuns: 13, walks: 38, strikeouts: 82, stolenBases: 0, caughtStealing: 0, totalBases: 105, avg: 0.241, obp: 0.35, slg: 0.477, ops: 0.827, iso: 0.236, wrcPlus: 128, xba: 0.252, xslg: 0.498, xwoba: 0.36, barrelRate: 0.152, hardHitRate: 0.49, chaseRate: 0.235, whiffRate: 0.32, sprintSpeed: 25.0, last14Ops: 0.861 },
  { mlbId: 624414, name: "Trevor Story", team: "BOS", position: "SS", bats: "R", plateAppearances: 180, atBats: 165, hits: 43, doubles: 9, triples: 1, homeRuns: 5, walks: 13, strikeouts: 45, stolenBases: 8, caughtStealing: 2, totalBases: 69, avg: 0.261, obp: 0.317, slg: 0.418, ops: 0.735, iso: 0.157, wrcPlus: 102, xba: 0.255, xslg: 0.413, xwoba: 0.322, barrelRate: 0.08, hardHitRate: 0.41, chaseRate: 0.302, whiffRate: 0.27, sprintSpeed: 28.0, last14Ops: 0.76 },
  { mlbId: 678882, name: "Wilyer Abreu", team: "BOS", position: "RF", bats: "L", plateAppearances: 450, atBats: 400, hits: 101, doubles: 33, triples: 2, homeRuns: 15, walks: 44, strikeouts: 128, stolenBases: 8, caughtStealing: 1, totalBases: 183, avg: 0.253, obp: 0.323, slg: 0.458, ops: 0.781, iso: 0.205, wrcPlus: 114, xba: 0.248, xslg: 0.445, xwoba: 0.334, barrelRate: 0.112, hardHitRate: 0.47, chaseRate: 0.278, whiffRate: 0.295, sprintSpeed: 27.3, last14Ops: 0.801 },
  { mlbId: 676106, name: "Connor Wong", team: "BOS", position: "C", bats: "R", plateAppearances: 487, atBats: 441, hits: 123, doubles: 24, triples: 2, homeRuns: 13, walks: 34, strikeouts: 108, stolenBases: 8, caughtStealing: 4, totalBases: 190, avg: 0.279, obp: 0.333, slg: 0.431, ops: 0.764, iso: 0.152, wrcPlus: 109, xba: 0.268, xslg: 0.415, xwoba: 0.328, barrelRate: 0.07, hardHitRate: 0.405, chaseRate: 0.335, whiffRate: 0.248, sprintSpeed: 26.2, last14Ops: 0.741 },
  { mlbId: 671213, name: "Masataka Yoshida", team: "BOS", position: "DH", bats: "L", plateAppearances: 421, atBats: 378, hits: 106, doubles: 21, triples: 1, homeRuns: 10, walks: 34, strikeouts: 44, stolenBases: 2, caughtStealing: 0, totalBases: 159, avg: 0.28, obp: 0.349, slg: 0.421, ops: 0.77, iso: 0.141, wrcPlus: 108, xba: 0.287, xslg: 0.425, xwoba: 0.337, barrelRate: 0.055, hardHitRate: 0.37, chaseRate: 0.26, whiffRate: 0.13, sprintSpeed: 25.4, last14Ops: 0.793 },
  { mlbId: 701350, name: "Ceddanne Rafaela", team: "BOS", position: "2B", bats: "R", plateAppearances: 571, atBats: 544, hits: 134, doubles: 23, triples: 5, homeRuns: 15, walks: 15, strikeouts: 151, stolenBases: 19, caughtStealing: 7, totalBases: 212, avg: 0.246, obp: 0.274, slg: 0.39, ops: 0.664, iso: 0.144, wrcPlus: 80, xba: 0.243, xslg: 0.382, xwoba: 0.288, barrelRate: 0.064, hardHitRate: 0.37, chaseRate: 0.395, whiffRate: 0.292, sprintSpeed: 28.1, last14Ops: 0.702 },
  { mlbId: 596119, name: "Rob Refsnyder", team: "BOS", position: "LF", bats: "R", plateAppearances: 307, atBats: 272, hits: 77, doubles: 15, triples: 1, homeRuns: 11, walks: 29, strikeouts: 72, stolenBases: 2, caughtStealing: 0, totalBases: 127, avg: 0.283, obp: 0.359, slg: 0.467, ops: 0.826, iso: 0.184, wrcPlus: 130, xba: 0.275, xslg: 0.447, xwoba: 0.356, barrelRate: 0.085, hardHitRate: 0.42, chaseRate: 0.24, whiffRate: 0.22, sprintSpeed: 25.9, last14Ops: 0.84 }
];

const pitcherStats: MlbRawPitcherStatRow[] = [
  { mlbId: 543037, name: "Gerrit Cole", team: "NYY", position: "SP", throws: "R", role: "starter", gamesStarted: 17, games: 17, inningsPitched: 95, battersFaced: 395, strikeouts: 99, walks: 29, hitsAllowed: 88, homeRunsAllowed: 11, earnedRuns: 39, era: 3.69, fip: 3.85, xera: 3.72, whip: 1.23, groundballRate: 0.405, cswRate: 0.302, swingingStrikeRate: 0.117, averageFastballVelocity: 95.5, recentPitches7d: 92 },
  { mlbId: 657376, name: "Luis Gil", team: "NYY", position: "SP", throws: "R", role: "starter", gamesStarted: 29, games: 29, inningsPitched: 151.2, battersFaced: 638, strikeouts: 171, walks: 77, hitsAllowed: 104, homeRunsAllowed: 19, earnedRuns: 64, era: 3.8, fip: 4.12, xera: 4.05, whip: 1.19, groundballRate: 0.36, cswRate: 0.289, swingingStrikeRate: 0.121, averageFastballVelocity: 96.8, recentPitches7d: 0 },
  { mlbId: 622491, name: "Tanner Houck", team: "BOS", position: "SP", throws: "R", role: "starter", gamesStarted: 30, games: 30, inningsPitched: 178.2, battersFaced: 732, strikeouts: 154, walks: 48, hitsAllowed: 167, homeRunsAllowed: 13, earnedRuns: 66, era: 3.33, fip: 3.55, xera: 3.68, whip: 1.2, groundballRate: 0.54, cswRate: 0.284, swingingStrikeRate: 0.103, averageFastballVelocity: 94.4, recentPitches7d: 88 },
  { mlbId: 657097, name: "Brayan Bello", team: "BOS", position: "SP", throws: "R", role: "starter", gamesStarted: 30, games: 30, inningsPitched: 162.1, battersFaced: 699, strikeouts: 153, walks: 64, hitsAllowed: 161, homeRunsAllowed: 16, earnedRuns: 75, era: 4.16, fip: 4.05, xera: 4.22, whip: 1.39, groundballRate: 0.505, cswRate: 0.276, swingingStrikeRate: 0.101, averageFastballVelocity: 95.6, recentPitches7d: 0 }
];

const hitterSplits: MlbRawHitterStatRow[] = [
  { mlbId: 592450, name: "Aaron Judge", team: "NYY", splitHand: "L", plateAppearances: 220, atBats: 170, hits: 57, doubles: 12, triples: 0, homeRuns: 22, walks: 47, strikeouts: 51, totalBases: 135, avg: 0.335, obp: 0.475, slg: 0.794, ops: 1.269, iso: 0.459 },
  { mlbId: 592450, name: "Aaron Judge", team: "NYY", splitHand: "R", plateAppearances: 484, atBats: 389, hits: 123, doubles: 24, triples: 1, homeRuns: 36, walks: 86, strikeouts: 120, totalBases: 257, avg: 0.316, obp: 0.45, slg: 0.661, ops: 1.111, iso: 0.345 },
  { mlbId: 646240, name: "Rafael Devers", team: "BOS", splitHand: "R", plateAppearances: 440, atBats: 382, hits: 109, doubles: 26, triples: 4, homeRuns: 24, walks: 53, strikeouts: 101, totalBases: 215, avg: 0.285, obp: 0.371, slg: 0.563, ops: 0.934, iso: 0.278 }
];

const pitcherSplits: MlbRawPitcherStatRow[] = [
  { mlbId: 543037, name: "Gerrit Cole", team: "NYY", splitHand: "L", inningsPitched: 40, battersFaced: 164, strikeouts: 42, walks: 12, hitsAllowed: 35, homeRunsAllowed: 5, earnedRuns: 16, era: 3.6, fip: 3.75, whip: 1.18 },
  { mlbId: 543037, name: "Gerrit Cole", team: "NYY", splitHand: "R", inningsPitched: 55, battersFaced: 231, strikeouts: 57, walks: 17, hitsAllowed: 53, homeRunsAllowed: 6, earnedRuns: 23, era: 3.76, fip: 3.92, whip: 1.27 },
  { mlbId: 622491, name: "Tanner Houck", team: "BOS", splitHand: "L", inningsPitched: 80, battersFaced: 330, strikeouts: 70, walks: 23, hitsAllowed: 76, homeRunsAllowed: 7, earnedRuns: 32, era: 3.6, fip: 3.78, whip: 1.24 }
];

const showPriors: MlbTheShowRatingRow[] = [
  { mlbId: 592450, name: "Aaron Judge", team: "NYY", overall: 99, contactL: 99, contactR: 98, powerL: 99, powerR: 99, discipline: 99, speed: 62, fielding: 80 },
  { mlbId: 543037, name: "Gerrit Cole", team: "NYY", overall: 88, h9: 84, k9: 88, bb9: 78, hr9: 77, stamina: 86 }
];

const ratings = buildMlbRealPlayerRatings({
  season: 2026,
  hitterStats,
  pitcherStats,
  hitterSplits,
  pitcherSplits,
  theShowRatings: showPriors,
  theShowPriorWeight: 0.1,
  minHitterPlateAppearances: 100,
  minPitcherBattersFaced: 100
});

assert.equal(ratings.modelVersion, "mlb-real-player-ratings-v1");
assert.equal(ratings.hitters.length, 18);
assert.equal(ratings.pitchers.length, 4);
assert.ok(ratings.warnings.some((warning) => warning.includes("low-weight prior")));

const judge = ratings.hitters.find((row) => row.name === "Aaron Judge");
assert.ok(judge);
assert.equal(judge!.metrics_json?.sourceKind, "REAL_STATS");
assert.equal(judge!.metrics_json?.showPriorUsed, true);
assert.ok(Number(judge!.power) > 90);
assert.ok(Number(judge!.vs_lhp) > Number(judge!.vs_rhp));
assert.ok(Number(judge!.overall) > 85);

const cole = ratings.pitchers.find((row) => row.name === "Gerrit Cole");
assert.ok(cole);
assert.equal(cole!.metrics_json?.sourceKind, "REAL_STATS");
assert.equal(cole!.metrics_json?.throws, "R");
assert.ok(Number(cole!.stamina) > 70);
assert.ok(Number(cole!.k_bb) > 70);

const nyy = buildMlbTeamContextFromRealRatings({
  team: "NYY",
  ratings,
  confirmedLineup: true,
  startingPitcherId: 543037,
  battingOrder: [
    { playerId: 665742, playerName: "Juan Soto" },
    { playerId: 592450, playerName: "Aaron Judge" },
    { playerId: 650402, playerName: "Gleyber Torres" },
    { playerId: 518934, playerName: "Giancarlo Stanton" },
    { playerId: 624413, playerName: "Anthony Rizzo" },
    { playerId: 643396, playerName: "Anthony Volpe" },
    { playerId: 669224, playerName: "Austin Wells" },
    { playerId: 683011, playerName: "Jasson Dominguez" },
    { playerId: 572761, playerName: "DJ LeMahieu" }
  ]
});
const bos = buildMlbTeamContextFromRealRatings({
  team: "BOS",
  ratings,
  confirmedLineup: true,
  startingPitcherId: 622491,
  battingOrder: [
    { playerId: 666139, playerName: "Jarren Duran" },
    { playerId: 646240, playerName: "Rafael Devers" },
    { playerId: 657077, playerName: "Triston Casas" },
    { playerId: 624414, playerName: "Trevor Story" },
    { playerId: 678882, playerName: "Wilyer Abreu" },
    { playerId: 676106, playerName: "Connor Wong" },
    { playerId: 671213, playerName: "Masataka Yoshida" },
    { playerId: 701350, playerName: "Ceddanne Rafaela" },
    { playerId: 596119, playerName: "Rob Refsnyder" }
  ]
});

assert.equal(nyy.hitters.length, 9);
assert.equal(bos.hitters.length, 9);
assert.equal(nyy.lineup?.confirmed, true);
assert.equal(nyy.lineup?.starting_pitcher_id, "543037");

const playerProjection = projectMlbPlayerStatsForGame({
  away: bos,
  home: nyy,
  awayRuns: 4.2,
  homeRuns: 4.8,
  awayOffenseScore: 76,
  homeOffenseScore: 84,
  awayWinProbability: 0.45,
  homeWinProbability: 0.55
});

assert.equal(playerProjection.modelVersion, "mlb-player-stat-projection-v1");
assert.equal(playerProjection.homeHitters.length, 9);
assert.equal(playerProjection.awayHitters.length, 9);
assert.equal(playerProjection.warnings.length, 0);
assert.ok(playerProjection.homeHitters[1].expectedHomeRuns > playerProjection.homeHitters[8].expectedHomeRuns);
assert.ok(playerProjection.homeStarter?.expectedOuts && playerProjection.homeStarter.expectedOuts > 14);
assert.ok(playerProjection.homeStarter?.over4_5StrikeoutsProbability && playerProjection.homeStarter.over4_5StrikeoutsProbability > 0.35);

const inningProjection = projectMlbInningMarkets({
  awayTeam: "BOS",
  homeTeam: "NYY",
  awayRuns: 4.2,
  homeRuns: 4.8,
  awayOffenseScore: 76,
  homeOffenseScore: 84,
  awayStarterScore: Number(bos.pitchers.find((row) => row.id === "622491")?.overall ?? 70),
  homeStarterScore: Number(nyy.pitchers.find((row) => row.id === "543037")?.overall ?? 70),
  awayBullpenScore: 72,
  homeBullpenScore: 77
});

assert.equal(inningProjection.modelVersion, "mlb-inning-market-projection-v1");
assert.ok(inningProjection.nrfiProbability > 0.25 && inningProjection.nrfiProbability < 0.75);
assert.ok(inningProjection.yrfiProbability > 0.25 && inningProjection.yrfiProbability < 0.75);
assert.ok(inningProjection.firstFiveTotalRuns > 3.5);
assert.ok(inningProjection.firstFiveHomeWinProbability > inningProjection.firstFiveAwayWinProbability);

console.log("mlb-real-player-ratings.test.ts passed");
