import assert from "node:assert/strict";

import { buildMlbCalibratedPlayerMarketSurface } from "@/services/simulation/mlb-calibrated-player-market-surface";
import type { MlbPlayerMarketCalibrationProfile } from "@/services/simulation/mlb-player-prop-inning-calibration";
import type { MlbInningMarketProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

const profile: MlbPlayerMarketCalibrationProfile = {
  modelVersion: "mlb-player-market-calibration-v1",
  status: "LEARNED",
  sampleSize: 1000,
  trainedAt: "2026-06-07T12:00:00.000Z",
  metrics: {},
  markets: {
    "player_prop:hitter_hits": {
      source: "player_prop",
      market: "hitter_hits",
      status: "LEARNED",
      sampleSize: 240,
      reliability: 0.55,
      winRate: 0.68,
      avgProbability: 0.61,
      avgConfidence: 0.7,
      accuracy: 0.62,
      brier: 0.21,
      logLoss: 0.63,
      baselineBrier: 0.25,
      brierImprovement: 0.04,
      probabilityBias: 0.07,
      probabilityShift: 0.05,
      confidenceCap: 0.74,
      minEdgeRequired: 0.035,
      buckets: []
    },
    "player_prop:pitcher_strikeouts": {
      source: "player_prop",
      market: "pitcher_strikeouts",
      status: "LEARNED",
      sampleSize: 200,
      reliability: 0.45,
      winRate: 0.5,
      avgProbability: 0.58,
      avgConfidence: 0.64,
      accuracy: 0.49,
      brier: 0.27,
      logLoss: 0.74,
      baselineBrier: 0.25,
      brierImprovement: -0.02,
      probabilityBias: -0.08,
      probabilityShift: -0.04,
      confidenceCap: 0.5,
      minEdgeRequired: 0.055,
      buckets: []
    },
    "inning_market:nrfi": {
      source: "inning_market",
      market: "nrfi",
      status: "LEARNED",
      sampleSize: 180,
      reliability: 0.4,
      winRate: 0.62,
      avgProbability: 0.56,
      avgConfidence: 0.62,
      accuracy: 0.58,
      brier: 0.225,
      logLoss: 0.66,
      baselineBrier: 0.25,
      brierImprovement: 0.025,
      probabilityBias: 0.06,
      probabilityShift: 0.04,
      confidenceCap: 0.68,
      minEdgeRequired: 0.03,
      buckets: []
    }
  }
};

const playerStatProjections: MlbPlayerStatProjectionGame = {
  modelVersion: "mlb-player-stat-projection-v1",
  awayTeam: "AWY",
  homeTeam: "HME",
  awayHitters: [{
    playerId: "a1",
    playerName: "Away Leadoff",
    team: "AWY",
    battingOrder: 1,
    expectedPlateAppearances: 4.8,
    hitProbability: 0.74,
    expectedHits: 1.25,
    expectedTotalBases: 1.4,
    expectedHomeRuns: 0.08,
    expectedRuns: 0.55,
    expectedRbi: 0.34,
    expectedWalks: 0.4,
    expectedStrikeouts: 0.8,
    stealAttemptProbability: 0.09,
    stolenBaseProbability: 0.06,
    confidence: 0.8,
    reasons: []
  }],
  homeHitters: [],
  awayStarter: {
    pitcherId: "asp",
    pitcherName: "Away Starter",
    team: "AWY",
    expectedInningsPitched: 5.4,
    expectedOuts: 16.2,
    expectedStrikeouts: 4.8,
    expectedEarnedRuns: 2.7,
    expectedHitsAllowed: 5.2,
    expectedWalksAllowed: 1.8,
    expectedHomeRunsAllowed: 0.8,
    qualityStartProbability: 0.35,
    over17_5OutsProbability: 0.42,
    over4_5StrikeoutsProbability: 0.59,
    firstFiveRunsAllowed: 2.3,
    confidence: 0.78,
    reasons: []
  },
  homeStarter: null,
  warnings: []
};

const inningProjection: MlbInningMarketProjection = {
  modelVersion: "mlb-inning-market-projection-v1",
  awayTeam: "AWY",
  homeTeam: "HME",
  innings: [{ inning: 1, awayExpectedRuns: 0.22, homeExpectedRuns: 0.28, expectedRuns: 0.5, noRunProbability: 0.6065 }],
  nrfiProbability: 0.61,
  yrfiProbability: 0.39,
  firstFiveAwayRuns: 2.1,
  firstFiveHomeRuns: 2.0,
  firstFiveTotalRuns: 4.1,
  firstFiveHomeWinProbability: 0.36,
  firstFiveAwayWinProbability: 0.41,
  firstFiveTieProbability: 0.23,
  firstFiveOver4_5Probability: 0.44,
  fullGameExpectedRuns: 8.2,
  warnings: []
};

const surface = buildMlbCalibratedPlayerMarketSurface({
  gameId: "game-1",
  eventLabel: "AWY @ HME",
  startTime: "2026-06-07T18:00:00.000Z",
  playerStatProjections,
  inningProjection,
  profile
});

assert.equal(surface.modelVersion, "mlb-calibrated-player-market-surface-v1");
assert.equal(surface.profileStatus, "LEARNED");
assert.equal(surface.profileSampleSize, 1000);
assert.ok(surface.marketCount > 0);
assert.ok(surface.promotedCount >= 1);
assert.ok(surface.promoted.some((market) => market.market === "hitter_hits" && market.calibratedProbability > market.rawProbability));
assert.ok(surface.markets.some((market) => market.market === "pitcher_strikeouts" && market.calibratedProbability < market.rawProbability));
assert.ok(surface.markets.some((market) => market.market === "nrfi" && market.decision !== "PASS"));
assert.ok(surface.markets.some((market) => market.calibrationStatus === "UNTRAINED" && market.decision === "PASS"));
assert.equal(surface.promoted[0].decision, "PROMOTE");

const untrainedSurface = buildMlbCalibratedPlayerMarketSurface({
  gameId: "game-1",
  eventLabel: "AWY @ HME",
  startTime: "2026-06-07T18:00:00.000Z",
  playerStatProjections,
  inningProjection,
  profile: null
});
assert.equal(untrainedSurface.profileStatus, "DEFAULT");
assert.equal(untrainedSurface.promotedCount, 0);
assert.ok(untrainedSurface.passCount > 0);
assert.ok(untrainedSurface.warnings.some((warning) => warning.includes("DEFAULT")));

console.log("mlb-calibrated-player-market-surface.test.ts passed");
