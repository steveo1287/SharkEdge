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
      historicalErrorCorrection: {
        sampleSize: 144,
        hitMeanBias: 0.015,
        totalBasesMeanBias: 0.02,
        homeRunMeanBias: 0.002,
        walkMeanBias: -0.004,
        strikeoutMeanBias: 0.01
      },
      umpire: {
        id: "UMP-42",
        sampleSize: 160,
        strikeZoneBoost: 0.018,
        walkBoost: -0.006,
        runFactor: 1.02
      },
      marketVariance: {
        hits: 1.08,
        totalBases: 1.18,
        homeRun: 1.26,
        walks: 0.96,
        strikeouts: 1.04
      },
      settlementFeedback: {
        sampleSize: 82,
        calibrationDrift: 0.035,
        lastUpdated: "2026-06-01T12:00:00Z"
      },
      stealAttemptRate: 0.035,
      stealSuccessRate: 0.73
    },
    ...overrides
  };
}

function pitcher(id: string, name: string, overall: number, role: string = overall >= 86 ? "ACE" : "TOP_ROTATION", overrides: Partial<MlbProjectionRating> = {}): MlbProjectionRating {
  return {
    id,
    name,
    team: "P",
    role_tier: role,
    xera_quality: overall,
    fip_quality: overall,
    k_bb: overall,
    hr_risk: 100 - overall,
    groundball_rate: overall,
    platoon_split: overall,
    stamina: overall,
    recent_workload: role === "TOP_ROTATION" || role === "ACE" ? 28 : 12,
    arsenal_quality: overall,
    overall,
    metrics_json: {
      throws: role === "SETUP" ? "L" : "R",
      pitchMix: {
        fourSeam: 0.42,
        slider: 0.24,
        changeup: 0.14,
        curveball: 0.08
      },
      whiffRate: 0.132,
      zoneRate: 0.49,
      hardHitAllowedRate: 0.36,
      barrelAllowedRate: 0.066,
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
  const relievers = [
    pitcher(`${teamName}-cl`, `${teamName} Closer`, starterBase + 2, "CLOSER"),
    pitcher(`${teamName}-su`, `${teamName} Setup`, starterBase, "SETUP"),
    pitcher(`${teamName}-mr`, `${teamName} Middle`, starterBase - 4, "MIDDLE_RELIEF")
  ];
  return {
    team: teamName,
    lineup: {
      confirmed: true,
      captured_at: new Date().toISOString(),
      starting_pitcher_id: starter.id,
      starting_pitcher_name: starter.name,
      batting_order_json: hitters.map((row) => ({ playerId: row.id, playerName: row.name }))
    },
    hitters,
    pitchers: [starter, ...relievers]
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

const topHomeHitter = playerProjection.homeHitters[0];
const paOutcome = topHomeHitter.plateAppearanceOutcome;
const eliteContext = topHomeHitter.eliteContext;
const paOutcomeSum = paOutcome.walkRate + paOutcome.strikeoutRate + paOutcome.homeRunRate + paOutcome.singleRate + paOutcome.extraBaseHitRate + paOutcome.ballInPlayOutRate;
assert.equal(playerProjection.modelVersion, "mlb-player-stat-projection-v1");
assert.equal(playerProjection.awayHitters.length, 9);
assert.equal(playerProjection.homeHitters.length, 9);
assert.ok(topHomeHitter.expectedPlateAppearances > playerProjection.homeHitters[8].expectedPlateAppearances);
assert.ok(topHomeHitter.expectedHits > 0.8);
assert.ok(topHomeHitter.stolenBaseProbability > 0);
assert.ok(topHomeHitter.batterStatProfile.confidence > 0.75);
assert.ok(topHomeHitter.batterStatProfile.xWoba > playerProjection.awayHitters[0].batterStatProfile.xWoba);
assert.ok(topHomeHitter.batterStatProfile.drivers.length > 0);
assert.ok(topHomeHitter.advancedMatchup.confidence > 0.55);
assert.ok(topHomeHitter.advancedMatchup.contactMultiplier > 1);
assert.ok(topHomeHitter.advancedMatchup.powerMultiplier > 1);
assert.ok(topHomeHitter.advancedMatchup.pitchTypeScore > 0);
assert.ok(topHomeHitter.advancedMatchup.rollingFormScore > 0);
assert.ok(topHomeHitter.advancedMatchup.drivers.some((driver) => driver.includes("pitch") || driver.includes("form") || driver.includes("environment")));
assert.equal(paOutcome.modelVersion, "mlb-plate-appearance-outcome-v1");
assert.ok(Math.abs(paOutcomeSum - 1) < 0.025);
assert.ok(paOutcome.hitRate > paOutcome.homeRunRate);
assert.ok(paOutcome.singleRate > 0);
assert.ok(paOutcome.extraBaseHitRate > 0);
assert.ok(paOutcome.ballInPlayOutRate > 0);
assert.ok(paOutcome.expectedTotalBasesPerPa > 0);
assert.ok(paOutcome.expectedTotalBasesPerHit >= 1.05);
assert.ok(paOutcome.outcomeConfidence > 0.55);
assert.ok(paOutcome.drivers.length > 0);
assert.equal(eliteContext.modelVersion, "mlb-elite-hitter-context-v1");
assert.ok(eliteContext.historicalErrorCorrection.sampleSize >= 100);
assert.ok(eliteContext.historicalErrorCorrection.confidence > 0.5);
assert.equal(eliteContext.umpireZoneImpact.umpireId, "UMP-42");
assert.ok(eliteContext.umpireZoneImpact.confidence > 0.5);
assert.ok(eliteContext.bullpenExposure.expectedBullpenPlateAppearances > 0.2);
assert.ok(eliteContext.bullpenExposure.confidence > 0.2);
assert.ok(eliteContext.varianceByMarket.totalBases > 1);
assert.ok(eliteContext.varianceByMarket.homeRun > 1);
assert.ok(eliteContext.lineupProtection.confidence > 0.5);
assert.equal(eliteContext.lineupConfirmation.status, "CONFIRMED");
assert.ok(eliteContext.lineupConfirmation.decayMultiplier <= 1);
assert.ok(eliteContext.settlementFeedback.sampleSize > 0);
assert.ok(eliteContext.drivers.some((driver) => driver.includes("historical") || driver.includes("umpire") || driver.includes("bullpen") || driver.includes("settlement")));
assert.ok(Math.abs(topHomeHitter.expectedHits - eliteContext.calibratedMeans.expectedHits) < 0.001);
assert.ok(Math.abs(topHomeHitter.expectedTotalBases - eliteContext.calibratedMeans.expectedTotalBases) < 0.001);
assert.ok(topHomeHitter.statDistribution.hit1PlusProbability > topHomeHitter.statDistribution.hit2PlusProbability);
assert.ok(topHomeHitter.statDistribution.hit2PlusProbability > topHomeHitter.statDistribution.hit3PlusProbability);
assert.ok(topHomeHitter.statDistribution.totalBases2PlusProbability > topHomeHitter.statDistribution.totalBases4PlusProbability);
assert.ok(topHomeHitter.statDistribution.homeRunProbability > 0);
assert.ok(topHomeHitter.statDistribution.strikeout1PlusProbability > topHomeHitter.statDistribution.strikeout3PlusProbability);
assert.ok(topHomeHitter.statDistribution.distributionConfidence > 0.55);
assert.ok(topHomeHitter.statDistribution.marketVolatility.homeRun > 1);
assert.ok(topHomeHitter.statDistribution.notes.some((note) => note.includes("Market volatility")));
assert.equal(topHomeHitter.propSurface.modelVersion, "mlb-batter-prop-surface-v1");
assert.ok(topHomeHitter.propSurface.outcomes.length >= 20);
assert.ok(topHomeHitter.propSurface.strongest.length > 0);
assert.ok(topHomeHitter.propSurface.outcomes.some((outcome) => outcome.market === "HITS" && outcome.line === 0.5 && outcome.side === "OVER"));
assert.ok(topHomeHitter.propSurface.outcomes.some((outcome) => outcome.market === "TOTAL_BASES" && outcome.line === 1.5 && outcome.side === "OVER"));
assert.ok(topHomeHitter.propSurface.outcomes.some((outcome) => outcome.market === "HOME_RUN" && outcome.line === 0.5));
assert.ok(topHomeHitter.propSurface.strongest.every((outcome) => Number.isFinite(outcome.fairAmerican)));
assert.ok(topHomeHitter.propSurface.notes.some((note) => note.includes("no-vig model prices")));
assert.ok(topHomeHitter.reasons.some((reason) => reason.includes("Batter stats blended")));
assert.ok(topHomeHitter.reasons.some((reason) => reason.includes("Advanced matchup multipliers")));
assert.ok(topHomeHitter.reasons.some((reason) => reason.includes("PA outcome tree")));
assert.ok(topHomeHitter.reasons.some((reason) => reason.includes("Elite context")));
assert.ok(topHomeHitter.reasons.some((reason) => reason.includes("Market variance")));
assert.ok(topHomeHitter.reasons.some((reason) => reason.includes("Quality contact")));
assert.ok(topHomeHitter.reasons.some((reason) => reason.includes("Distribution:")));
assert.ok(topHomeHitter.reasons.some((reason) => reason.includes("Prop surface strongest")));
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
  away: { ...away, lineup: { ...away.lineup, confirmed: false, captured_at: "2026-01-01T00:00:00Z" } },
  home,
  awayRuns: 4,
  homeRuns: 4.2
});
assert.ok(unconfirmed.warnings.some((warning) => warning.includes("not confirmed")));
assert.equal(unconfirmed.awayHitters[0].eliteContext.lineupConfirmation.status, "STALE");
assert.ok(unconfirmed.awayHitters[0].eliteContext.lineupConfirmation.confidencePenalty > 0.1);

console.log("mlb-player-stat-inning-engine.test.ts passed");
