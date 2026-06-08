import assert from "node:assert/strict";

import { buildMlbBaseStateRunRbiEngine } from "@/services/simulation/mlb-base-state-run-rbi-engine";
import type { MlbGamePlateAppearanceScript, MlbHitterPlateAppearancePath, MlbPlateAppearanceNode } from "@/services/simulation/mlb-plate-appearance-game-script";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";

function pa(paNumber: number, inning: number, hit = 0.27): MlbPlateAppearanceNode {
  return { paNumber, inning, pitchingPhase: paNumber >= 4 ? "BULLPEN" : paNumber === 3 ? "STARTER_FATIGUE" : "STARTER_SECOND_LOOK", pitcherRole: paNumber >= 4 ? "BULLPEN" : "STARTER", bestOutcome: hit >= 0.3 ? "CONTACT_PLUS" : "CONTACT", hitProbability: hit, extraBaseHitProbability: 0.12, homeRunProbability: 0.035, walkProbability: 0.09, strikeoutProbability: 0.18, ballInPlayOutProbability: 0.46, runContext: 0.12, rbiContext: 0.12, confidence: 0.72, note: "test" };
}

function path(id: string, name: string, team: string, order: number): MlbHitterPlateAppearancePath {
  const plateAppearances = [pa(1, 1, 0.25), pa(2, 3, 0.28), pa(3, 5, 0.31), pa(4, 7, 0.29)];
  return { playerId: id, playerName: name, team, battingOrder: order, expectedPlateAppearances: 4.4, latePaChance: order <= 2 ? 0.48 : 0.34, bestHitWindow: plateAppearances[2], bestPowerWindow: plateAppearances[3], highestStrikeoutRiskWindow: plateAppearances[0], bullpenExposureShare: 0.25, summary: "test", plateAppearances };
}

function hitter(id: string, name: string, team: string, order: number, overrides: Partial<MlbSimulatedHitterBoxScore> = {}): MlbSimulatedHitterBoxScore {
  return {
    playerId: id,
    playerName: name,
    team,
    battingOrder: order,
    confidence: 0.72,
    impactScore: 36,
    volatility: 1.05,
    expected: { plateAppearances: 4.4, atBats: 4, hits: 1.05, totalBases: 1.6, homeRuns: 0.08, runs: 0.5, rbi: 0.5, walks: 0.35, strikeouts: 0.85, stolenBases: 0.03 },
    probabilities: { hit1Plus: 0.66, hit2Plus: 0.28, hit3Plus: 0.07, totalBases2Plus: 0.42, totalBases4Plus: 0.14, homeRun: 0.08, walk1Plus: 0.31, strikeout2Plus: 0.22 },
    ...overrides
  } as MlbSimulatedHitterBoxScore;
}

const awayHitters = [
  hitter("lead", "Lead Runner", "CHC", 1, { expected: { plateAppearances: 4.7, atBats: 4.2, hits: 1.1, totalBases: 1.45, homeRuns: 0.04, runs: 0.68, rbi: 0.28, walks: 0.48, strikeouts: 0.7, stolenBases: 0.08 } as MlbSimulatedHitterBoxScore["expected"] }),
  hitter("table", "Table Setter", "CHC", 2, { expected: { plateAppearances: 4.6, atBats: 4.1, hits: 1.15, totalBases: 1.55, homeRuns: 0.05, runs: 0.62, rbi: 0.36, walks: 0.44, strikeouts: 0.75, stolenBases: 0.05 } as MlbSimulatedHitterBoxScore["expected"] }),
  hitter("driver", "Middle Driver", "CHC", 3, { expected: { plateAppearances: 4.5, atBats: 4, hits: 1.2, totalBases: 2.0, homeRuns: 0.13, runs: 0.58, rbi: 0.64, walks: 0.38, strikeouts: 0.8, stolenBases: 0.02 } as MlbSimulatedHitterBoxScore["expected"] }),
  hitter("clean", "Cleanup Bat", "CHC", 4, { expected: { plateAppearances: 4.4, atBats: 4, hits: 1.15, totalBases: 2.15, homeRuns: 0.17, runs: 0.54, rbi: 0.72, walks: 0.36, strikeouts: 0.9, stolenBases: 0.01 } as MlbSimulatedHitterBoxScore["expected"] }),
  hitter("trap", "Trap Bat", "CHC", 5, { expected: { plateAppearances: 4.1, atBats: 3.8, hits: 0.88, totalBases: 1.25, homeRuns: 0.06, runs: 0.36, rbi: 0.56, walks: 0.2, strikeouts: 1.1, stolenBases: 0.01 } as MlbSimulatedHitterBoxScore["expected"], probabilities: { hit1Plus: 0.46, hit2Plus: 0.16, hit3Plus: 0.03, totalBases2Plus: 0.22, totalBases4Plus: 0.05, homeRun: 0.04, walk1Plus: 0.12, strikeout2Plus: 0.33 } as MlbSimulatedHitterBoxScore["probabilities"] })
];
const homeHitters = [1,2,3,4,5].map((order) => hitter(`h${order}`, `Home ${order}`, "STL", order));
const paths = [...awayHitters, ...homeHitters].map((h) => path(h.playerId, h.playerName, h.team, h.battingOrder));
const boxScore = { awayTeam: { team: "CHC", hitters: awayHitters }, homeTeam: { team: "STL", hitters: homeHitters } } as MlbSimulatedGameBoxScore;
const plateAppearanceScript = { modelVersion: "mlb-plate-appearance-game-script-v1", awayTeam: { team: "CHC", opponentTeam: "STL", paths: paths.filter((p) => p.team === "CHC") }, homeTeam: { team: "STL", opponentTeam: "CHC", paths: paths.filter((p) => p.team === "STL") }, topPlateAppearancePaths: paths, summary: "test" } as MlbGamePlateAppearanceScript;

const context = buildMlbBaseStateRunRbiEngine({ boxScore, plateAppearanceScript });
assert.equal(context.modelVersion, "mlb-base-state-run-rbi-engine-v1");
assert.equal(context.awayTeam.contexts.length, 5);
assert.ok(context.bestRbiWindows.length > 0);
assert.ok(context.bestRunWindows.length > 0);
assert.ok(context.lineupProtectionBoosts.length > 0);
assert.ok(context.tableSetterBoosts.length > 0);
assert.ok(context.summary.includes("Base-state layer"));
const lead = context.awayTeam.contexts.find((row) => row.playerId === "lead")!;
const driver = context.awayTeam.contexts.find((row) => row.playerId === "driver")!;
const clean = context.awayTeam.contexts.find((row) => row.playerId === "clean")!;
assert.equal(lead.lineupRole, "LEADOFF_ENGINE");
assert.ok(lead.expectedRunsAfterContext >= lead.expectedRunsBeforeContext);
assert.ok(driver.rbiOpportunityScore > lead.rbiOpportunityScore);
assert.ok(clean.expectedRbiAfterContext >= clean.expectedRbiBeforeContext);
assert.ok(driver.baseStateWindows.length >= 4);
assert.ok(driver.bestRbiWindow.runnerInScoringPositionProbability > 0);
for (const row of context.awayTeam.contexts) {
  assert.ok(row.runContextMultiplier >= 0.72 && row.runContextMultiplier <= 1.32);
  assert.ok(row.rbiContextMultiplier >= 0.68 && row.rbiContextMultiplier <= 1.34);
  assert.ok(row.drivers.length > 0);
}

console.log("mlb-base-state-run-rbi-engine.test.ts passed");
