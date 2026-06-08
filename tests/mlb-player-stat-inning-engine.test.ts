import assert from "node:assert/strict";

import {
  projectMlbInningMarkets,
  projectMlbPlayerStatsForGame,
  type MlbProjectionRating,
  type MlbProjectionTeamContext
} from "@/services/simulation/mlb-player-stat-inning-engine";

function hitter(id: string, name: string, overall: number, overrides: Partial<MlbProjectionRating> = {}): MlbProjectionRating {
  const xwoba = 0.325 + (overall - 70) * 0.0025;
  return {
    id,
    name,
    team: "A",
    role_tier: overall >= 84 ? "STAR" : "STARTER",
    contact: overall,
    power: overall,
    discipline: overall,
    vs_lhp: overall - 2,
    vs_rhp: overall + 1,
    baserunning: overall,
    fielding: 70,
    current_form: overall,
    overall,
    metrics_json: {
      plateAppearances: 520,
      avg: 0.255 + (overall - 70) * 0.002,
      obp: 0.325 + (overall - 70) * 0.002,
      slg: 0.42 + (overall - 70) * 0.004,
      xba: 0.252 + (overall - 70) * 0.002,
      xslg: 0.415 + (overall - 70) * 0.004,
      xwoba,
      iso: 0.16 + (overall - 70) * 0.003,
      hitRate: 0.23 + (overall - 70) * 0.002,
      walkRate: 0.08,
      strikeoutRate: 0.22 - (overall - 70) * 0.001,
      hrRate: 0.03 + (overall - 70) * 0.001,
      barrelRate: 0.08 + (overall - 70) * 0.001,
      hardHitRate: 0.4 + (overall - 70) * 0.002,
      avgExitVelo: 88.5 + (overall - 70) * 0.12,
      totalBasesPerHit: 1.5 + (overall - 70) * 0.008,
      rolling30Pa: 96,
      rolling30Xwoba: xwoba + 0.014,
      rolling14Xwoba: xwoba + 0.022,
      rolling7Xwoba: xwoba + 0.028,
      pitchTypeXwoba: {
        fourSeam: xwoba + 0.045,
        slider: xwoba + 0.018,
        changeup: xwoba - 0.005
      },
      parkRunFactor: 1.04,
      parkHrFactor: 1.08,
      weatherRunFactor: 1.02,
      weatherHrFactor: 1.07,
      stealAttemptRate: 0.035,
      stealSuccessRate: 0.73
    },
    ...overrides
  };
}

function pitcher(id: string, name: string, overall: number, overrides: Partial<MlbProjectionRating> = {}): MlbProjectionRating {
  return {
    id,
    name,
    team: "P",
    role_tier: overall >= 86 ? "ACE" : "TOP_ROTATION",
    xera_quality: overall,
    fip_quality: overall,
    k_bb: overall,
    hr_risk: 100 - overall,
    groundball_rate: overall,
    platoon_split: overall,
    stamina: overall,
    recent_workload: 28,
    arsenal_quality: overall,
    overall,
    metrics_json: {
      throws: "R",
      pitchMix: {
        fourSeam: 0.42,
        slider: 0.24,
        changeup: 0.14,
        curveball: 0.08
      },
      inningsPerStart: 5.9,
      strikeoutsPer9: 9.2,
      walksPer9: 2.4,
      hitsPer9: 7.5,
      homeRunsPer9: 0.9
    },
    ...overrides
  };
}

function team(teamName: string, hitterBase: number, starterBase: number): MlbProjectionTeamContext {
  const hitters = Array.from({ length: 9 }, (_, index) => hitter(`${teamName}-h${index + 1}`, `${teamName} H${index + 1}`, hitterBase - index));
  const starter = pitcher(`${teamName}-sp`, `${teamName} Starter`, starterBase);
  return {
    team: teamName,
    lineup: {
      confirmed: true,
      starting_pitcher_id: starter.id,
      starting_pitcher_name: starter.name,
      batting_order_json: hitters.map((row) => ({ playerId: row.id, playerName: row.name }))
    },
    hitters,
    pitchers: [starter]
  };
}

const away = team("AWY", 82, 78);
const home = team("HME", 88, 86);
const playerProjection = projectMlbPlayerStatsForGame({
  away,
  home,
  awayRuns: 4.1,
  homeRuns: 5.0,
  awayOffenseScore: 78,
  homeOffenseScore: 84,
  awayWinProbability: 0.44,
  homeWinProbability: 0.56
});

assert.equal(playerProjection.modelVersion, "mlb-player-stat-projection-v1");
assert.equal(playerProjection.awayHitters.length, 9);
assert.equal(playerProjection.homeHitters.length, 9);
assert.ok(playerProjection.homeHitters[0].expectedPlateAppearances > playerProjection.homeHitters[8].expectedPlateAppearances);
assert.ok(playerProjection.homeHitters[0].expectedHits > 0.8);
assert.ok(playerProjection.homeHitters[0].stolenBaseProbability > 0);
assert.ok(playerProjection.homeHitters[0].batterStatProfile.confidence > 0.75);
assert.ok(playerProjection.homeHitters[0].batterStatProfile.xWoba > playerProjection.awayHitters[0].batterStatProfile.xWoba);
assert.ok(playerProjection.homeHitters[0].batterStatProfile.drivers.length > 0);
assert.ok(playerProjection.homeHitters[0].advancedMatchup.confidence > 0.55);
assert.ok(playerProjection.homeHitters[0].advancedMatchup.contactMultiplier > 1);
assert.ok(playerProjection.homeHitters[0].advancedMatchup.powerMultiplier > 1);
assert.ok(playerProjection.homeHitters[0].advancedMatchup.pitchTypeScore > 0);
assert.ok(playerProjection.homeHitters[0].advancedMatchup.rollingFormScore > 0);
assert.ok(playerProjection.homeHitters[0].advancedMatchup.drivers.some((driver) => driver.includes("pitch") || driver.includes("form") || driver.includes("environment")));
assert.ok(playerProjection.homeHitters[0].reasons.some((reason) => reason.includes("Batter stats blended")));
assert.ok(playerProjection.homeHitters[0].reasons.some((reason) => reason.includes("Advanced matchup multipliers")));
assert.ok(playerProjection.homeStarter);
assert.ok(playerProjection.homeStarter!.expectedOuts > 15);
assert.ok(playerProjection.homeStarter!.expectedStrikeouts > 4);
assert.ok(playerProjection.homeStarter!.over17_5OutsProbability > 0.25);
assert.equal(playerProjection.warnings.length, 0);

const inningProjection = projectMlbInningMarkets({
  awayTeam: "AWY",
  homeTeam: "HME",
  awayRuns: 4.1,
  homeRuns: 5.0,
  awayOffenseScore: 78,
  homeOffenseScore: 84,
  awayStarterScore: 78,
  homeStarterScore: 86,
  awayBullpenScore: 73,
  homeBullpenScore: 79
});

assert.equal(inningProjection.modelVersion, "mlb-inning-market-projection-v1");
assert.equal(inningProjection.innings.length, 9);
assert.ok(inningProjection.nrfiProbability > 0.2 && inningProjection.nrfiProbability < 0.8);
assert.ok(inningProjection.yrfiProbability > 0.2 && inningProjection.yrfiProbability < 0.8);
assert.ok(inningProjection.firstFiveTotalRuns > 4);
assert.ok(inningProjection.firstFiveHomeWinProbability > inningProjection.firstFiveAwayWinProbability);
assert.ok(inningProjection.firstFiveOver4_5Probability > 0.3);
assert.ok(Math.abs(inningProjection.fullGameExpectedRuns - 9.1) < 0.001);

const unconfirmed = projectMlbPlayerStatsForGame({
  away: { ...away, lineup: { ...away.lineup, confirmed: false } },
  home,
  awayRuns: 4,
  homeRuns: 4.2
});
assert.ok(unconfirmed.warnings.some((warning) => warning.includes("not confirmed")));

console.log("mlb-player-stat-inning-engine.test.ts passed");
