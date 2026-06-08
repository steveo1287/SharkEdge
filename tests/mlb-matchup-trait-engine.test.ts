import assert from "node:assert/strict";

import { buildMlbMatchupTraitEngine } from "@/services/simulation/mlb-matchup-trait-engine";
import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame, MlbStarterPerGameProjection } from "@/services/simulation/mlb-player-stat-inning-engine";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";

function hitter(id: string, name: string, team: string, order: number, edge: number): MlbHitterPerGameProjection {
  return {
    playerId: id,
    playerName: name,
    team,
    battingOrder: order,
    expectedPlateAppearances: 4.5,
    hitProbability: 0.62,
    expectedHits: 1.05,
    expectedTotalBases: 1.75,
    expectedHomeRuns: 0.12,
    expectedRuns: 0.55,
    expectedRbi: 0.58,
    expectedWalks: 0.36,
    expectedStrikeouts: edge < 0 ? 1.25 : 0.82,
    stealAttemptProbability: 0.04,
    stolenBaseProbability: 0.02,
    confidence: 0.72,
    batterStatProfile: { hitRate: 0.25, walkRate: edge > 10 ? 0.12 : 0.08, strikeoutRate: edge < 0 ? 0.31 : 0.18, hrRate: 0.035, tbPerHit: 1.65, xAvg: 0.265, xSlug: edge > 10 ? 0.51 : 0.41, xWoba: edge > 10 ? 0.37 : 0.31, iso: edge > 10 ? 0.23 : 0.15, barrelRate: edge > 10 ? 0.12 : 0.06, hardHitRate: edge > 10 ? 0.48 : 0.38, avgExitVelocity: edge > 10 ? 91.2 : 88.1, plateAppearances: 520, confidence: 0.78, drivers: [] },
    advancedMatchup: { contactMultiplier: edge > 0 ? 1.08 : 0.94, powerMultiplier: edge > 10 ? 1.18 : edge > 0 ? 1.06 : 0.9, strikeoutMultiplier: edge < 0 ? 1.16 : 0.94, walkMultiplier: edge > 0 ? 1.05 : 0.96, paMultiplier: 1, confidence: 0.76, rollingFormScore: edge * 0.45, pitchTypeScore: edge, environmentScore: edge > 8 ? 5 : 0, platoonScore: edge > 0 ? 4 : -5, drivers: edge > 0 ? ["pitch-mix-advantage", "platoon-edge"] : ["pitch-mix-risk", "platoon-risk"] },
    plateAppearanceOutcome: {} as MlbHitterPerGameProjection["plateAppearanceOutcome"],
    eliteContext: {} as MlbHitterPerGameProjection["eliteContext"],
    statDistribution: { hit0Probability: 0.36, hit1PlusProbability: 0.64, hit2PlusProbability: 0.28, hit3PlusProbability: 0.06, totalBases1PlusProbability: 0.68, totalBases2PlusProbability: 0.42, totalBases3PlusProbability: 0.22, totalBases4PlusProbability: edge > 10 ? 0.22 : 0.1, homeRunProbability: edge > 10 ? 0.13 : 0.06, walk1PlusProbability: 0.3, strikeout0Probability: 0.35, strikeout1PlusProbability: 0.65, strikeout2PlusProbability: edge < 0 ? 0.38 : 0.22, strikeout3PlusProbability: 0.08, volatility: edge > 10 ? 1.35 : 1.05, marketVolatility: { hits: 1, totalBases: 1.1, homeRun: 1.2, walks: 1, strikeouts: 1 }, distributionConfidence: 0.72, notes: [] },
    propSurface: {} as MlbHitterPerGameProjection["propSurface"],
    reasons: []
  };
}

function starter(id: string, name: string, team: string, k: number, hr: number): MlbStarterPerGameProjection {
  return { pitcherId: id, pitcherName: name, team, expectedInningsPitched: 5.8, expectedOuts: 17.4, expectedStrikeouts: k, expectedEarnedRuns: 2.8, expectedHitsAllowed: 5.2, expectedWalksAllowed: 1.8, expectedHomeRunsAllowed: hr, qualityStartProbability: 0.45, over17_5OutsProbability: 0.55, over4_5StrikeoutsProbability: 0.58, firstFiveRunsAllowed: 2.2, confidence: 0.72, reasons: [] };
}

function box(id: string, name: string, team: string, order: number, impact: number): MlbSimulatedHitterBoxScore {
  return { playerId: id, playerName: name, team, battingOrder: order, tier: impact > 40 ? "PLUS" : "STABLE", confidenceLabel: "HIGH", volatilityLabel: "MEDIUM", matchupEdge: impact / 4, range: { floor: { hits: 0.2, totalBases: 0.3, homeRuns: 0.01, runs: 0.1, rbi: 0.1, walks: 0.1, strikeouts: 0.2 }, median: { hits: 1, totalBases: 2, homeRuns: 0.1, runs: 0.5, rbi: 0.5, walks: 0.3, strikeouts: 0.8 }, ceiling: { hits: 2.2, totalBases: 4.8, homeRuns: 0.5, runs: 1.4, rbi: 1.6, walks: 1, strikeouts: 1.8 } }, expected: { plateAppearances: 4.5, atBats: 4, hits: 1.05, totalBases: 1.75, homeRuns: 0.12, runs: 0.55, rbi: 0.58, walks: 0.36, strikeouts: 0.9, stolenBases: 0.02 }, likelyLine: { plateAppearances: 4, atBats: 4, hits: 1, totalBases: 2, homeRuns: 0, runs: 1, rbi: 1, walks: 0, strikeouts: 1, stolenBases: 0 }, probabilities: { hit1Plus: 0.64, hit2Plus: 0.28, hit3Plus: 0.06, totalBases2Plus: 0.42, totalBases4Plus: 0.14, homeRun: 0.08, walk1Plus: 0.3, strikeout2Plus: 0.22 }, confidence: 0.76, impactScore: impact, volatility: 1.08, summary: "test", reasons: [] };
}

const projection: MlbPlayerStatProjectionGame = {
  modelVersion: "mlb-player-stat-projection-v1",
  awayTeam: "CHC",
  homeTeam: "STL",
  awayHitters: [hitter("a1", "Power Edge", "CHC", 1, 16), hitter("a2", "Contact Edge", "CHC", 2, 8), hitter("a3", "Risk Bat", "CHC", 3, -12)],
  homeHitters: [hitter("h1", "Home Edge", "STL", 1, 10), hitter("h2", "Home Risk", "STL", 2, -8)],
  awayStarter: starter("sp1", "Away Power Arm", "CHC", 7.2, 0.6),
  homeStarter: starter("sp2", "Home HR Risk", "STL", 4.3, 1.25),
  warnings: []
};

const boxScore = { modelVersion: "mlb-simulated-box-score-v2", awayTeam: { team: "CHC", hitters: [box("a1", "Power Edge", "CHC", 1, 46), box("a2", "Contact Edge", "CHC", 2, 38), box("a3", "Risk Bat", "CHC", 3, 24)] }, homeTeam: { team: "STL", hitters: [box("h1", "Home Edge", "STL", 1, 40), box("h2", "Home Risk", "STL", 2, 22)] } } as MlbSimulatedGameBoxScore;

const traits = buildMlbMatchupTraitEngine({ projection, boxScore });
assert.equal(traits.modelVersion, "mlb-matchup-trait-engine-v1");
assert.equal(traits.awayTeam.rows.length, 3);
assert.equal(traits.homeTeam.rows.length, 2);
assert.ok(traits.topTraitAdvantages.length > 0);
assert.ok(traits.topPowerAdvantages.length > 0);
assert.ok(traits.topContactAdvantages.length > 0);
assert.ok(traits.topPitchMixEdges.length > 0);
assert.ok(traits.topPlatoonEdges.length > 0);
assert.ok(traits.topStrikeoutRisks.length > 0);
assert.ok(traits.summary.includes("Matchup traits"));
const power = traits.topPowerAdvantages[0];
assert.ok(power.adjustedExpected.totalBases >= 0);
assert.ok(Number.isFinite(power.deltas.homeRuns));
assert.ok(["ELITE_EDGE", "ADVANTAGE", "NEUTRAL", "RISK", "AVOID"].includes(power.traitLabel));
assert.ok(["L", "R", "S", "UNKNOWN"].includes(power.batterHand));
assert.ok(power.drivers.length > 0);
const risk = traits.topStrikeoutRisks[0];
assert.ok(risk.strikeoutMultiplier >= 0.9);
assert.ok(Number.isFinite(risk.traitScore));

console.log("mlb-matchup-trait-engine.test.ts passed");
