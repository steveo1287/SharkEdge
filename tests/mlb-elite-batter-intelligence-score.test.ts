import assert from "node:assert/strict";

import { buildMlbBaseStateRunRbiEngine } from "@/services/simulation/mlb-base-state-run-rbi-engine";
import { buildMlbEliteBatterIntelligenceScore } from "@/services/simulation/mlb-elite-batter-intelligence-score";
import { buildMlbMatchupTraitEngine } from "@/services/simulation/mlb-matchup-trait-engine";
import { buildMlbPlateAppearanceGameScript } from "@/services/simulation/mlb-plate-appearance-game-script";
import { buildMlbPaWindowRanking } from "@/services/simulation/mlb-pa-window-ranking";
import type { MlbHitterPerGameProjection, MlbPlayerStatProjectionGame, MlbStarterPerGameProjection } from "@/services/simulation/mlb-player-stat-inning-engine";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";

function starter(id: string, name: string, team: string): MlbStarterPerGameProjection {
  return { pitcherId: id, pitcherName: name, team, expectedInningsPitched: 5.5, expectedOuts: 16.5, expectedStrikeouts: 5.4, expectedEarnedRuns: 2.7, expectedHitsAllowed: 5.1, expectedWalksAllowed: 1.8, expectedHomeRunsAllowed: 0.8, qualityStartProbability: 0.42, over17_5OutsProbability: 0.5, over4_5StrikeoutsProbability: 0.56, firstFiveRunsAllowed: 2.1, confidence: 0.72, reasons: [] };
}

function projectionHitter(id: string, name: string, team: string, order: number, edge: number): MlbHitterPerGameProjection {
  return {
    playerId: id,
    playerName: name,
    team,
    battingOrder: order,
    expectedPlateAppearances: 4.7 - order * 0.07,
    hitProbability: 0.62 + edge * 0.006,
    expectedHits: 1 + edge * 0.018,
    expectedTotalBases: 1.55 + edge * 0.04,
    expectedHomeRuns: 0.08 + edge * 0.004,
    expectedRuns: 0.5 + edge * 0.01,
    expectedRbi: 0.48 + edge * 0.012,
    expectedWalks: 0.32 + edge * 0.004,
    expectedStrikeouts: 0.9 - edge * 0.01,
    stealAttemptProbability: 0.04,
    stolenBaseProbability: 0.02,
    confidence: 0.74,
    batterStatProfile: { hitRate: 0.25, walkRate: edge > 8 ? 0.12 : 0.08, strikeoutRate: edge < 0 ? 0.31 : 0.18, hrRate: 0.035, tbPerHit: 1.65, xAvg: 0.265, xSlug: edge > 8 ? 0.51 : 0.41, xWoba: edge > 8 ? 0.37 : 0.31, iso: edge > 8 ? 0.23 : 0.15, barrelRate: edge > 8 ? 0.12 : 0.06, hardHitRate: edge > 8 ? 0.48 : 0.38, avgExitVelocity: edge > 8 ? 91.2 : 88.1, plateAppearances: 520, confidence: 0.78, drivers: [] },
    advancedMatchup: { contactMultiplier: edge > 0 ? 1.07 : 0.94, powerMultiplier: edge > 8 ? 1.17 : edge > 0 ? 1.06 : 0.9, strikeoutMultiplier: edge < 0 ? 1.16 : 0.94, walkMultiplier: edge > 0 ? 1.05 : 0.96, paMultiplier: 1, confidence: 0.76, rollingFormScore: edge * 0.45, pitchTypeScore: edge, environmentScore: edge > 8 ? 5 : 0, platoonScore: edge > 0 ? 4 : -5, drivers: edge > 0 ? ["pitch-mix-advantage", "platoon-edge"] : ["pitch-mix-risk", "platoon-risk"] },
    plateAppearanceOutcome: {} as MlbHitterPerGameProjection["plateAppearanceOutcome"],
    eliteContext: {} as MlbHitterPerGameProjection["eliteContext"],
    statDistribution: { hit0Probability: 0.34, hit1PlusProbability: 0.66 + edge * 0.005, hit2PlusProbability: 0.28, hit3PlusProbability: 0.06, totalBases1PlusProbability: 0.68, totalBases2PlusProbability: 0.42 + edge * 0.004, totalBases3PlusProbability: 0.22, totalBases4PlusProbability: edge > 8 ? 0.22 : 0.1, homeRunProbability: edge > 8 ? 0.13 : 0.06, walk1PlusProbability: 0.3, strikeout0Probability: 0.35, strikeout1PlusProbability: 0.65, strikeout2PlusProbability: edge < 0 ? 0.38 : 0.22, strikeout3PlusProbability: 0.08, volatility: edge > 8 ? 1.35 : 1.05, marketVolatility: { hits: 1, totalBases: 1.1, homeRun: 1.2, walks: 1, strikeouts: 1 }, distributionConfidence: 0.72, notes: [] },
    propSurface: {} as MlbHitterPerGameProjection["propSurface"],
    reasons: edge > 0 ? ["strong-box-profile"] : ["risk-profile"]
  };
}

function box(h: MlbHitterPerGameProjection, impact: number): MlbSimulatedHitterBoxScore {
  return { playerId: h.playerId, playerName: h.playerName, team: h.team, battingOrder: h.battingOrder, tier: impact > 42 ? "PLUS" : impact < 25 ? "VOLATILE" : "STABLE", confidenceLabel: "HIGH", volatilityLabel: impact < 25 ? "HIGH" : "MEDIUM", matchupEdge: impact / 4, range: { floor: { hits: 0.2, totalBases: 0.3, homeRuns: 0.01, runs: 0.1, rbi: 0.1, walks: 0.1, strikeouts: 0.2 }, median: { hits: 1, totalBases: 2, homeRuns: 0.1, runs: 0.5, rbi: 0.5, walks: 0.3, strikeouts: 0.8 }, ceiling: { hits: 2.2, totalBases: 4.8, homeRuns: 0.5, runs: 1.4, rbi: 1.6, walks: 1, strikeouts: 1.8 } }, expected: { plateAppearances: h.expectedPlateAppearances, atBats: 4, hits: h.expectedHits, totalBases: h.expectedTotalBases, homeRuns: h.expectedHomeRuns, runs: h.expectedRuns, rbi: h.expectedRbi, walks: h.expectedWalks, strikeouts: h.expectedStrikeouts, stolenBases: 0.02 }, likelyLine: { plateAppearances: 4, atBats: 4, hits: 1, totalBases: 2, homeRuns: 0, runs: 1, rbi: 1, walks: 0, strikeouts: 1, stolenBases: 0 }, probabilities: { hit1Plus: h.statDistribution.hit1PlusProbability, hit2Plus: 0.28, hit3Plus: 0.06, totalBases2Plus: h.statDistribution.totalBases2PlusProbability, totalBases4Plus: h.statDistribution.totalBases4PlusProbability, homeRun: h.statDistribution.homeRunProbability, walk1Plus: 0.3, strikeout2Plus: h.statDistribution.strikeout2PlusProbability }, confidence: 0.76, impactScore: impact, volatility: impact < 25 ? 1.5 : 1.08, summary: "test", reasons: h.reasons };
}

const away = [projectionHitter("a1", "Elite Bat", "CHC", 1, 14), projectionHitter("a2", "Contact Bat", "CHC", 2, 7), projectionHitter("a3", "Risk Bat", "CHC", 3, -10)];
const home = [projectionHitter("h1", "Power Bat", "STL", 1, 11), projectionHitter("h2", "Neutral Bat", "STL", 2, 2)];
const projection: MlbPlayerStatProjectionGame = { modelVersion: "mlb-player-stat-projection-v1", awayTeam: "CHC", homeTeam: "STL", awayHitters: away, homeHitters: home, awayStarter: starter("sp1", "Away Starter", "CHC"), homeStarter: starter("sp2", "Home Starter", "STL"), warnings: [] };
const boxScore = { modelVersion: "mlb-simulated-box-score-v2", awayTeam: { team: "CHC", hitters: away.map((h, i) => box(h, i === 0 ? 48 : i === 2 ? 22 : 36)), totals: { projectedRuns: 4.6 } }, homeTeam: { team: "STL", hitters: home.map((h, i) => box(h, i === 0 ? 44 : 32)), totals: { projectedRuns: 4.2 } } } as MlbSimulatedGameBoxScore;
const pitching = { awayPitching: { exposure: { expectedBullpenInnings: 3.3 }, starter: { expected: { inningsPitched: 5.7 } } }, homePitching: { exposure: { expectedBullpenInnings: 3.5 }, starter: { expected: { inningsPitched: 5.5 } } } } as Parameters<typeof buildMlbPlateAppearanceGameScript>[0];
const plateAppearanceScript = buildMlbPlateAppearanceGameScript({ projection, boxScore, awayPitching: pitching.awayPitching, homePitching: pitching.homePitching });
const paWindowRanking = buildMlbPaWindowRanking({ boxScore, plateAppearanceScript });
const baseStateContext = buildMlbBaseStateRunRbiEngine({ boxScore, plateAppearanceScript });
const matchupTraitContext = buildMlbMatchupTraitEngine({ projection, boxScore });
const elite = buildMlbEliteBatterIntelligenceScore({ boxScore, plateAppearanceScript, paWindowRanking, baseStateContext, matchupTraitContext });
assert.equal(elite.modelVersion, "mlb-elite-batter-intelligence-score-v1");
assert.ok(elite.overall.length === 5);
assert.ok(elite.overall[0].rank === 1);
assert.ok(elite.overall[0].score >= elite.overall[elite.overall.length - 1].score);
assert.ok(elite.overall[0].componentScores.boxScore >= 0);
assert.ok(elite.overall[0].componentScores.matchupTrait >= 0);
assert.ok(elite.overall[0].componentScores.plateAppearance >= 0);
assert.ok(elite.overall[0].componentScores.baseState >= 0);
assert.ok(elite.overall[0].tags.length > 0);
assert.ok(elite.overall[0].drivers.length > 0);
assert.ok(elite.coreBats.length >= 0);
assert.ok(elite.powerCeiling.length > 0);
assert.ok(elite.contactFloor.length > 0);
assert.ok(elite.summary.includes("Elite batter board"));
assert.ok(elite.riskTraps.some((row) => row.playerName === "Risk Bat") || elite.overall.some((row) => row.playerName === "Risk Bat" && row.warnings.length));
for (const row of elite.overall) {
  assert.ok(row.score >= 0 && row.score <= 100);
  assert.ok(row.confidence >= 0 && row.confidence <= 1);
  assert.ok(["A_PLUS", "A", "B_PLUS", "B", "WATCH", "FADE"].includes(row.grade));
}
console.log("mlb-elite-batter-intelligence-score.test.ts passed");
