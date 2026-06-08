import assert from "node:assert/strict";

import { buildMlbSimulatedBoxScore } from "@/services/simulation/mlb-simulated-box-score";
import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

function hitter(id: string, name: string, team: string, order: number, boost = 0): MlbHitterPerGameProjection {
  return {
    playerId: id,
    playerName: name,
    team,
    battingOrder: order,
    expectedPlateAppearances: 4.7 - order * 0.05,
    hitProbability: 0.62 + boost,
    expectedHits: 0.9 + boost,
    expectedTotalBases: 1.35 + boost * 2.1,
    expectedHomeRuns: 0.08 + boost * 0.18,
    expectedRuns: 0.5 + boost * 0.6,
    expectedRbi: 0.48 + boost * 0.7,
    expectedWalks: 0.34 + boost * 0.15,
    expectedStrikeouts: 0.95 - boost * 0.2,
    stealAttemptProbability: 0.04,
    stolenBaseProbability: 0.025 + boost * 0.03,
    confidence: 0.72 + boost * 0.1,
    batterStatProfile: {
      plateAppearances: 510,
      xAvg: 0.265 + boost * 0.03,
      xSlug: 0.44 + boost * 0.08,
      xWoba: 0.34 + boost * 0.05,
      iso: 0.17 + boost * 0.08,
      hitRate: 0.24 + boost * 0.05,
      walkRate: 0.08,
      strikeoutRate: 0.21,
      hrRate: 0.03 + boost * 0.02,
      barrelRate: 0.08 + boost * 0.04,
      hardHitRate: 0.42 + boost * 0.08,
      avgExitVelocity: 89 + boost * 2,
      tbPerHit: 1.55 + boost * 0.35,
      confidence: 0.78,
      drivers: ["test batter profile"]
    },
    advancedMatchup: {
      modelVersion: "mlb-advanced-matchup-v1",
      contactMultiplier: 1.02,
      powerMultiplier: 1.04,
      walkMultiplier: 1,
      strikeoutMultiplier: 0.98,
      pitchTypeScore: 3,
      rollingFormScore: 2,
      environmentScore: 1,
      pitcherSuppressionScore: -2,
      confidence: 0.66,
      drivers: ["test matchup"]
    },
    plateAppearanceOutcome: {
      modelVersion: "mlb-plate-appearance-outcome-v1",
      walkRate: 0.09,
      strikeoutRate: 0.2,
      homeRunRate: 0.035 + boost * 0.02,
      singleRate: 0.16,
      extraBaseHitRate: 0.08 + boost * 0.04,
      ballInPlayOutRate: 0.435,
      hitRate: 0.24 + boost * 0.05,
      expectedTotalBasesPerPa: 0.35 + boost * 0.2,
      expectedTotalBasesPerHit: 1.55 + boost * 0.35,
      outcomeConfidence: 0.68,
      pitcherSuppressionScore: -2,
      drivers: ["test outcome"]
    },
    eliteContext: {
      modelVersion: "mlb-elite-hitter-context-v1",
      calibratedMeans: {
        expectedHits: 0.9 + boost,
        expectedTotalBases: 1.35 + boost * 2.1,
        expectedHomeRuns: 0.08 + boost * 0.18,
        expectedWalks: 0.34 + boost * 0.15,
        expectedStrikeouts: 0.95 - boost * 0.2,
        expectedRuns: 0.5 + boost * 0.6,
        expectedRbi: 0.48 + boost * 0.7
      },
      multipliers: {
        hit: 1,
        totalBases: 1,
        homeRun: 1,
        walk: 1,
        strikeout: 1,
        run: 1,
        rbi: 1
      },
      historicalErrorCorrection: { sampleSize: 0, confidence: 0, appliedBias: {} },
      umpireZoneImpact: { confidence: 0, strikeoutMultiplier: 1, walkMultiplier: 1, contactMultiplier: 1, runMultiplier: 1 },
      bullpenExposure: { expectedBullpenPlateAppearances: 1, leverageExposure: 0.5, handednessAdvantage: 0, hitMultiplier: 1, powerMultiplier: 1, confidence: 0.5 },
      varianceByMarket: { hits: 1, totalBases: 1.1, homeRun: 1.2, walks: 1, strikeouts: 1 },
      lineupProtection: { protectionScore: 0, baseStateMultiplier: 1, runMultiplier: 1, rbiMultiplier: 1, confidence: 0.5 },
      lineupConfirmation: { status: "CONFIRMED", decayMultiplier: 1, confidencePenalty: 0, minutesSinceCaptured: 10 },
      settlementFeedback: { sampleSize: 0, calibrationDrift: 0, confidenceMultiplier: 1 },
      confidenceAdjustment: 0,
      drivers: ["test elite context"]
    },
    statDistribution: {
      hit0Probability: 0.35 - boost,
      hit1PlusProbability: 0.65 + boost,
      hit2PlusProbability: 0.28 + boost * 0.4,
      hit3PlusProbability: 0.07 + boost * 0.15,
      totalBases1PlusProbability: 0.69 + boost,
      totalBases2PlusProbability: 0.42 + boost * 0.5,
      totalBases3PlusProbability: 0.26 + boost * 0.3,
      totalBases4PlusProbability: 0.14 + boost * 0.28,
      homeRunProbability: 0.09 + boost * 0.2,
      walk1PlusProbability: 0.3 + boost * 0.1,
      strikeout0Probability: 0.38,
      strikeout1PlusProbability: 0.62,
      strikeout2PlusProbability: 0.25 - boost * 0.1,
      strikeout3PlusProbability: 0.08,
      volatility: 1.05 + boost * 0.4,
      marketVolatility: { hits: 1, totalBases: 1.1, homeRun: 1.2, walks: 1, strikeouts: 1 },
      distributionConfidence: 0.72,
      notes: []
    },
    propSurface: { modelVersion: "mlb-batter-prop-surface-v1", outcomes: [], strongest: [], notes: [] },
    reasons: ["test projection reason"]
  };
}

const projection: MlbPlayerStatProjectionGame = {
  modelVersion: "mlb-player-stat-projection-v1",
  awayTeam: "CHC",
  homeTeam: "STL",
  awayHitters: Array.from({ length: 9 }, (_, index) => hitter(`a${index + 1}`, `Away ${index + 1}`, "CHC", index + 1, index === 2 ? 0.24 : 0.02)),
  homeHitters: Array.from({ length: 9 }, (_, index) => hitter(`h${index + 1}`, `Home ${index + 1}`, "STL", index + 1, index === 0 ? 0.3 : 0.03)),
  awayStarter: null,
  homeStarter: null,
  warnings: []
};

const boxScore = buildMlbSimulatedBoxScore(projection);
assert.equal(boxScore.modelVersion, "mlb-simulated-box-score-v1");
assert.equal(boxScore.awayTeam.team, "CHC");
assert.equal(boxScore.homeTeam.team, "STL");
assert.equal(boxScore.awayTeam.hitters.length, 9);
assert.equal(boxScore.homeTeam.hitters.length, 9);
assert.ok(boxScore.awayTeam.totals.hits > 0);
assert.ok(boxScore.homeTeam.totals.totalBases > boxScore.homeTeam.totals.hits);
assert.ok(boxScore.gameTotals.projectedRuns > 0);
assert.ok(boxScore.gameTotals.projectedHits > 0);
assert.ok(boxScore.gameTotals.projectedStrikeouts > 0);
assert.ok(boxScore.topProjectedHitters.length === 10);
assert.ok(boxScore.topProjectedHitters[0].impactScore >= boxScore.topProjectedHitters[1].impactScore);
assert.ok(boxScore.topProjectedHitters[0].likelyLine.plateAppearances >= 3);
assert.ok(boxScore.topProjectedHitters[0].summary.length > 0);
assert.ok(boxScore.topProjectedHitters[0].reasons.length > 0);
assert.ok(boxScore.notes.some((note) => note.includes("No sportsbook prop odds")));

console.log("mlb-simulated-box-score.test.ts passed");
