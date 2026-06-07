import assert from "node:assert/strict";

import {
  buildMlbEliteRatingSystem,
  buildMlbEliteTeamRating,
  deriveMlbEliteGameSimulationInputs,
  type MlbEliteHitterTendencyRow,
  type MlbElitePitcherTendencyRow,
  type MlbEliteTeamContextRow
} from "@/services/simulation/mlb-elite-rating-system";
import type {
  MlbRawHitterStatRow,
  MlbRawPitcherStatRow,
  MlbTheShowRatingRow
} from "@/services/simulation/mlb-real-player-ratings";
import {
  projectMlbInningMarkets,
  projectMlbPlayerStatsForGame
} from "@/services/simulation/mlb-player-stat-inning-engine";

type HitterSeed = {
  id: number;
  name: string;
  team: string;
  tier: number;
  bats?: "L" | "R" | "S";
  position?: string;
};

type PitcherSeed = {
  id: number;
  name: string;
  team: string;
  tier: number;
  starts: number;
  throws?: "L" | "R";
  role?: "starter" | "reliever";
};

const hitters: HitterSeed[] = [
  { id: 1001, name: "Metro Leadoff", team: "NYM", tier: 82, bats: "L", position: "CF" },
  { id: 1002, name: "Metro Thumper", team: "NYM", tier: 94, bats: "R", position: "RF" },
  { id: 1003, name: "Metro Anchor", team: "NYM", tier: 88, bats: "L", position: "1B" },
  { id: 1004, name: "Metro Power", team: "NYM", tier: 84, bats: "R", position: "DH" },
  { id: 1005, name: "Metro Contact", team: "NYM", tier: 78, bats: "R", position: "2B" },
  { id: 1006, name: "Metro Switch", team: "NYM", tier: 76, bats: "S", position: "SS" },
  { id: 1007, name: "Metro Catcher", team: "NYM", tier: 73, bats: "L", position: "C" },
  { id: 1008, name: "Metro Corner", team: "NYM", tier: 72, bats: "R", position: "3B" },
  { id: 1009, name: "Metro Nine", team: "NYM", tier: 70, bats: "R", position: "LF" },
  { id: 2001, name: "Bay Leadoff", team: "SFG", tier: 78, bats: "L", position: "CF" },
  { id: 2002, name: "Bay Bat", team: "SFG", tier: 83, bats: "R", position: "LF" },
  { id: 2003, name: "Bay Lefty", team: "SFG", tier: 81, bats: "L", position: "1B" },
  { id: 2004, name: "Bay Power", team: "SFG", tier: 79, bats: "R", position: "DH" },
  { id: 2005, name: "Bay Contact", team: "SFG", tier: 76, bats: "R", position: "2B" },
  { id: 2006, name: "Bay Short", team: "SFG", tier: 75, bats: "S", position: "SS" },
  { id: 2007, name: "Bay Catcher", team: "SFG", tier: 72, bats: "R", position: "C" },
  { id: 2008, name: "Bay Third", team: "SFG", tier: 71, bats: "L", position: "3B" },
  { id: 2009, name: "Bay Nine", team: "SFG", tier: 68, bats: "R", position: "RF" }
];

const pitchers: PitcherSeed[] = [
  { id: 3001, name: "Metro Ace", team: "NYM", tier: 91, starts: 28, throws: "R", role: "starter" },
  { id: 3002, name: "Metro Setup", team: "NYM", tier: 82, starts: 0, throws: "R", role: "reliever" },
  { id: 3003, name: "Metro Lefty", team: "NYM", tier: 79, starts: 0, throws: "L", role: "reliever" },
  { id: 3004, name: "Metro Middle", team: "NYM", tier: 74, starts: 0, throws: "R", role: "reliever" },
  { id: 4001, name: "Bay Starter", team: "SFG", tier: 81, starts: 27, throws: "L", role: "starter" },
  { id: 4002, name: "Bay Closer", team: "SFG", tier: 84, starts: 0, throws: "R", role: "reliever" },
  { id: 4003, name: "Bay Setup", team: "SFG", tier: 78, starts: 0, throws: "R", role: "reliever" },
  { id: 4004, name: "Bay Middle", team: "SFG", tier: 72, starts: 0, throws: "L", role: "reliever" }
];

function hitterStat(seed: HitterSeed): MlbRawHitterStatRow {
  const skill = seed.tier - 70;
  const pa = 560 + skill * 4;
  const avg = 0.245 + skill * 0.0032;
  const obp = 0.315 + skill * 0.0045;
  const slg = 0.41 + skill * 0.011;
  const hr = Math.max(4, 15 + skill * 1.45);
  const hits = Math.round(pa * 0.225 + skill * 2.1);
  const walks = Math.round(pa * (0.08 + skill * 0.002));
  const strikeouts = Math.round(pa * Math.max(0.14, 0.23 - skill * 0.003));
  return {
    mlbId: seed.id,
    name: seed.name,
    team: seed.team,
    position: seed.position,
    bats: seed.bats,
    plateAppearances: pa,
    atBats: Math.round(pa - walks - 5),
    hits,
    doubles: Math.round(20 + skill * 0.8),
    triples: seed.position === "CF" ? 5 : 1,
    homeRuns: Math.round(hr),
    walks,
    strikeouts,
    stolenBases: seed.position === "CF" ? 22 : Math.max(1, Math.round(skill * 0.55)),
    caughtStealing: seed.position === "CF" ? 5 : 1,
    totalBases: Math.round(hits * (1.42 + skill * 0.018)),
    avg,
    obp,
    slg,
    ops: obp + slg,
    iso: slg - avg,
    wrcPlus: 100 + skill * 4.4,
    xba: avg + 0.004,
    xslg: slg + 0.012,
    xwoba: 0.32 + skill * 0.007,
    barrelRate: 0.075 + skill * 0.006,
    hardHitRate: 0.39 + skill * 0.008,
    chaseRate: 0.285 - skill * 0.004,
    whiffRate: 0.245 - skill * 0.003,
    sprintSpeed: 27 + (seed.position === "CF" ? 1.2 : skill * 0.03),
    last14Ops: obp + slg + skill * 0.004
  };
}

function hitterTendency(seed: HitterSeed): MlbEliteHitterTendencyRow {
  const skill = seed.tier - 70;
  return {
    mlbId: seed.id,
    name: seed.name,
    team: seed.team,
    position: seed.position,
    bats: seed.bats,
    plateAppearances: 560 + skill * 4,
    xba: 0.245 + skill * 0.0035,
    xslg: 0.41 + skill * 0.012,
    xwoba: 0.32 + skill * 0.0075,
    expectedOps: 0.725 + skill * 0.016,
    barrelRate: 0.075 + skill * 0.006,
    hardHitRate: 0.39 + skill * 0.008,
    averageExitVelocity: 88.5 + skill * 0.24,
    maxExitVelocity: 109 + skill * 0.55,
    sweetSpotRate: 0.335 + skill * 0.003,
    pullAirRate: 0.205 + skill * 0.002,
    groundballRate: 0.43 - skill * 0.002,
    lineDriveRate: 0.245 + skill * 0.0015,
    flyballRate: 0.37 + skill * 0.002,
    chaseRate: 0.285 - skill * 0.004,
    whiffRate: 0.245 - skill * 0.003,
    zoneContactRate: 0.825 + skill * 0.003,
    firstPitchSwingRate: 0.29 + skill * 0.001,
    walkRate: 0.085 + skill * 0.002,
    strikeoutRate: Math.max(0.13, 0.225 - skill * 0.003),
    rolling7Xwoba: 0.32 + skill * 0.007,
    rolling14Xwoba: 0.32 + skill * 0.0078,
    rolling30Xwoba: 0.32 + skill * 0.0072,
    rolling14Ops: 0.725 + skill * 0.017,
    vsLhpWoba: 0.32 + skill * 0.007 + (seed.bats === "R" ? 0.012 : -0.004),
    vsRhpWoba: 0.32 + skill * 0.007 + (seed.bats === "L" ? 0.012 : 0.002),
    vsLhpIso: 0.165 + skill * 0.005,
    vsRhpIso: 0.165 + skill * 0.0055,
    sprintSpeed: 27 + (seed.position === "CF" ? 1.2 : skill * 0.03),
    baserunningRuns: seed.position === "CF" ? 5 : skill * 0.2,
    outsAboveAverage: seed.position === "CF" || seed.position === "SS" ? 5 : skill * 0.1,
    defensiveRunsSaved: seed.position === "C" ? 4 : skill * 0.08
  };
}

function pitcherStat(seed: PitcherSeed): MlbRawPitcherStatRow {
  const skill = seed.tier - 70;
  const starter = seed.role === "starter";
  const ip = starter ? 150 + skill * 3 : 58 + skill * 0.7;
  const bf = ip * 4.25;
  return {
    mlbId: seed.id,
    name: seed.name,
    team: seed.team,
    position: starter ? "SP" : "RP",
    throws: seed.throws,
    role: seed.role,
    gamesStarted: seed.starts,
    games: starter ? seed.starts : 58,
    inningsPitched: ip,
    battersFaced: bf,
    strikeouts: Math.round(bf * (0.225 + skill * 0.006)),
    walks: Math.round(bf * Math.max(0.045, 0.085 - skill * 0.002)),
    hitsAllowed: Math.round(ip * Math.max(5.9, 8.5 - skill * 0.11) / 9),
    homeRunsAllowed: Math.round(ip * Math.max(0.45, 1.1 - skill * 0.025) / 9),
    earnedRuns: Math.round(ip * Math.max(2.2, 4.2 - skill * 0.12) / 9),
    era: Math.max(2.2, 4.2 - skill * 0.12),
    fip: Math.max(2.35, 4.2 - skill * 0.11),
    xera: Math.max(2.3, 4.1 - skill * 0.115),
    whip: Math.max(0.9, 1.3 - skill * 0.014),
    groundballRate: 0.43 + skill * 0.004,
    cswRate: 0.285 + skill * 0.004,
    swingingStrikeRate: 0.112 + skill * 0.003,
    averageFastballVelocity: 93.5 + skill * 0.18,
    recentPitches7d: starter ? 92 : 21
  };
}

function pitcherTendency(seed: PitcherSeed): MlbElitePitcherTendencyRow {
  const skill = seed.tier - 70;
  const starter = seed.role === "starter";
  return {
    mlbId: seed.id,
    name: seed.name,
    team: seed.team,
    role: seed.role,
    throws: seed.throws,
    battersFaced: starter ? 650 + skill * 12 : 240 + skill * 6,
    inningsPitched: starter ? 150 + skill * 3 : 58 + skill * 0.7,
    gamesStarted: seed.starts,
    xera: Math.max(2.3, 4.1 - skill * 0.115),
    xwobaAllowed: Math.max(0.245, 0.32 - skill * 0.0055),
    xbaAllowed: Math.max(0.19, 0.245 - skill * 0.0035),
    xslgAllowed: Math.max(0.31, 0.41 - skill * 0.008),
    barrelRateAllowed: Math.max(0.035, 0.075 - skill * 0.0022),
    hardHitRateAllowed: Math.max(0.29, 0.39 - skill * 0.005),
    averageExitVelocityAllowed: 88.5 - skill * 0.22,
    groundballRate: 0.43 + skill * 0.004,
    chaseRate: 0.285 + skill * 0.004,
    whiffRate: 0.245 + skill * 0.005,
    cswRate: 0.285 + skill * 0.004,
    zoneRate: 0.49 + skill * 0.002,
    firstPitchStrikeRate: 0.61 + skill * 0.003,
    strikeoutRate: 0.225 + skill * 0.006,
    walkRate: Math.max(0.045, 0.085 - skill * 0.002),
    kMinusBbRate: 0.14 + skill * 0.008,
    averageFastballVelocity: 93.5 + skill * 0.18,
    velocityTrend30d: seed.tier >= 85 ? 0.4 : 0.05,
    pitchModelStuff: 100 + skill * 1.7,
    pitchModelLocation: 100 + skill * 1.1,
    pitchModelPitching: 100 + skill * 1.4,
    extension: 6.3 + skill * 0.03,
    releaseConsistency: skill * 0.08,
    inningsPerStart: starter ? 5.25 + skill * 0.08 : 1.05,
    pitchesPerStart: starter ? 88 + skill * 1.2 : 18,
    pitchCountLast7d: starter ? 92 : 21,
    pitchCountLast3d: starter ? 0 : 11,
    daysRest: starter ? 5 : 1,
    vsLhbWoba: Math.max(0.24, 0.32 - skill * 0.005),
    vsRhbWoba: Math.max(0.24, 0.32 - skill * 0.0055),
    catcherFramingRuns: starter ? 1.5 : 0
  };
}

const showPriors: MlbTheShowRatingRow[] = [
  { mlbId: 1002, name: "Metro Thumper", team: "NYM", overall: 94, contactL: 92, contactR: 91, powerL: 97, powerR: 98, discipline: 88, speed: 55, fielding: 72 },
  { mlbId: 3001, name: "Metro Ace", team: "NYM", overall: 92, h9: 91, k9: 94, bb9: 84, hr9: 86, stamina: 89 }
];

const teamContexts: MlbEliteTeamContextRow[] = [
  { team: "NYM", defensiveRunsSaved: 18, outsAboveAverage: 14, catcherFramingRuns: 6, bullpenFatigueIndex: 8, unavailableRelievers: [{ playerId: 3004, playerName: "Metro Middle", leverage: 0.7 }] },
  { team: "SFG", defensiveRunsSaved: 7, outsAboveAverage: 4, catcherFramingRuns: 2, bullpenFatigueIndex: 18, unavailableRelievers: [{ playerId: 4003, playerName: "Bay Setup", leverage: 1.4 }] }
];

const ratings = buildMlbEliteRatingSystem({
  season: 2026,
  hitterStats: hitters.map(hitterStat),
  pitcherStats: pitchers.map(pitcherStat),
  hitterTendencies: hitters.map(hitterTendency),
  pitcherTendencies: pitchers.map(pitcherTendency),
  theShowRatings: showPriors,
  teamContexts,
  marketCalibration: [
    { scope: "HITTER", mlbId: 1002, market: "hitter_hit", modelProbability: 0.61, closingNoVigProbability: 0.64, sampleSize: 120 },
    { scope: "PITCHER", mlbId: 3001, market: "pitcher_strikeouts", modelProbability: 0.56, closingNoVigProbability: 0.6, sampleSize: 90 },
    { scope: "TEAM", team: "NYM", market: "moneyline", modelProbability: 0.53, closingNoVigProbability: 0.56, sampleSize: 140 }
  ],
  options: {
    minHitterPlateAppearances: 100,
    minPitcherBattersFaced: 100,
    theShowPriorWeight: 0.06
  }
});

assert.equal(ratings.modelVersion, "mlb-elite-rating-system-v1");
assert.equal(ratings.baseModelVersion, "mlb-real-player-ratings-v1");
assert.equal(ratings.hitters.length, 18);
assert.equal(ratings.pitchers.length, 8);
assert.equal(ratings.diagnostics.hitterTendencyCoverage, 1);
assert.equal(ratings.diagnostics.pitcherTendencyCoverage, 1);
assert.ok(ratings.diagnostics.averageHitterReliability > 0.6);
assert.ok(ratings.diagnostics.averagePitcherReliability > 0.55);
assert.ok(ratings.diagnostics.dataQuality > 65);

const metroThumper = ratings.hitters.find((row) => row.id === "1002");
assert.ok(metroThumper);
assert.equal(metroThumper!.metrics_json?.ratingSystem, "mlb-elite-rating-system-v1");
assert.equal(metroThumper!.metrics_json?.sourceKind, "REAL_STATS");
assert.ok(Number(metroThumper!.power) > Number(metroThumper!.contact));
assert.ok(Number(metroThumper!.overall) > 84);
assert.ok(Number(metroThumper!.metrics_json?.eliteReliability) > 0.6);

const metroAce = ratings.pitchers.find((row) => row.id === "3001");
assert.ok(metroAce);
assert.equal(metroAce!.role_tier, "ACE");
assert.ok(Number(metroAce!.arsenal_quality) > 80);
assert.ok(Number(metroAce!.k_bb) > 80);
assert.ok(Number(metroAce!.metrics_json?.teamDefenseSupport) > 70);

const nym = buildMlbEliteTeamRating({
  team: "NYM",
  ratings,
  confirmedLineup: true,
  startingPitcherId: 3001,
  teamContext: teamContexts[0],
  battingOrder: hitters.filter((row) => row.team === "NYM").map((row) => ({ playerId: row.id, playerName: row.name }))
});
const sfg = buildMlbEliteTeamRating({
  team: "SFG",
  ratings,
  confirmedLineup: true,
  startingPitcherId: 4001,
  teamContext: teamContexts[1],
  battingOrder: hitters.filter((row) => row.team === "SFG").map((row) => ({ playerId: row.id, playerName: row.name }))
});

assert.ok(nym.offenseScore > sfg.offenseScore);
assert.ok(nym.starterScore > sfg.starterScore);
assert.ok(nym.bullpenScore > sfg.bullpenScore);
assert.ok(nym.reliability > 0.55);
assert.equal(nym.warnings.length, 0);

const gameInputs = deriveMlbEliteGameSimulationInputs({ away: sfg, home: nym });
assert.equal(gameInputs.awayTeam, "SFG");
assert.equal(gameInputs.homeTeam, "NYM");
assert.ok(gameInputs.homeOffenseScore > gameInputs.awayOffenseScore);
assert.ok(gameInputs.homeStarterScore > gameInputs.awayStarterScore);
assert.ok(gameInputs.dataQuality > 55);

const playerProjection = projectMlbPlayerStatsForGame({
  away: sfg.context,
  home: nym.context,
  awayRuns: 3.9,
  homeRuns: 4.8,
  awayOffenseScore: gameInputs.awayOffenseScore,
  homeOffenseScore: gameInputs.homeOffenseScore,
  awayWinProbability: 0.43,
  homeWinProbability: 0.57
});
assert.equal(playerProjection.awayHitters.length, 9);
assert.equal(playerProjection.homeHitters.length, 9);
assert.ok(playerProjection.homeStarter?.expectedStrikeouts && playerProjection.homeStarter.expectedStrikeouts > 5);
assert.ok(playerProjection.homeStarter?.over17_5OutsProbability && playerProjection.homeStarter.over17_5OutsProbability > 0.35);

const inningProjection = projectMlbInningMarkets({
  awayTeam: gameInputs.awayTeam,
  homeTeam: gameInputs.homeTeam,
  awayRuns: 3.9,
  homeRuns: 4.8,
  awayOffenseScore: gameInputs.awayOffenseScore,
  homeOffenseScore: gameInputs.homeOffenseScore,
  awayStarterScore: gameInputs.awayStarterScore,
  homeStarterScore: gameInputs.homeStarterScore,
  awayBullpenScore: gameInputs.awayBullpenScore,
  homeBullpenScore: gameInputs.homeBullpenScore
});
assert.ok(inningProjection.nrfiProbability > 0.25 && inningProjection.nrfiProbability < 0.75);
assert.ok(inningProjection.firstFiveHomeWinProbability > inningProjection.firstFiveAwayWinProbability);
assert.ok(inningProjection.firstFiveTotalRuns > 3.5);

console.log("mlb-elite-rating-system.test.ts passed");
