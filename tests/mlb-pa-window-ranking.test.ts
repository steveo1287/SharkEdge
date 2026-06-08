import assert from "node:assert/strict";

import { buildMlbPaWindowRanking } from "@/services/simulation/mlb-pa-window-ranking";
import type { MlbGamePlateAppearanceScript, MlbHitterPlateAppearancePath, MlbPlateAppearanceNode } from "@/services/simulation/mlb-plate-appearance-game-script";
import type { MlbSimulatedGameBoxScore, MlbSimulatedHitterBoxScore } from "@/services/simulation/mlb-simulated-box-score";

function node(paNumber: number, inning: number, phase: MlbPlateAppearanceNode["pitchingPhase"], hit: number, xbh: number, hr: number, walk: number, k: number): MlbPlateAppearanceNode {
  return {
    paNumber,
    inning,
    pitchingPhase: phase,
    pitcherRole: phase.includes("BULLPEN") ? "BULLPEN" : "STARTER",
    bestOutcome: hr >= 0.07 ? "POWER" : hit >= 0.31 ? "CONTACT_PLUS" : k >= 0.31 ? "STRIKEOUT_RISK" : "CONTACT",
    hitProbability: hit,
    extraBaseHitProbability: xbh,
    homeRunProbability: hr,
    walkProbability: walk,
    strikeoutProbability: k,
    ballInPlayOutProbability: Math.max(0.1, 1 - hit - walk - k),
    runContext: 0.12,
    rbiContext: 0.14,
    confidence: 0.72,
    note: "test"
  };
}

function path(id: string, name: string, team: string, order: number, profile: "hit" | "power" | "late" | "k" | "safe"): MlbHitterPlateAppearancePath {
  const nodes = profile === "hit"
    ? [node(1, 1, "STARTER_FRESH", 0.26, 0.09, 0.025, 0.08, 0.19), node(2, 3, "STARTER_SECOND_LOOK", 0.34, 0.12, 0.035, 0.08, 0.17), node(3, 5, "STARTER_FATIGUE", 0.33, 0.16, 0.045, 0.09, 0.18), node(4, 7, "BULLPEN", 0.3, 0.15, 0.05, 0.1, 0.21)]
    : profile === "power"
      ? [node(1, 1, "STARTER_FRESH", 0.23, 0.11, 0.035, 0.07, 0.24), node(2, 3, "STARTER_SECOND_LOOK", 0.25, 0.14, 0.045, 0.08, 0.23), node(3, 5, "STARTER_FATIGUE", 0.27, 0.2, 0.08, 0.09, 0.24), node(4, 7, "BULLPEN", 0.26, 0.23, 0.095, 0.1, 0.26)]
      : profile === "late"
        ? [node(1, 1, "STARTER_FRESH", 0.24, 0.1, 0.025, 0.08, 0.18), node(2, 3, "STARTER_SECOND_LOOK", 0.25, 0.11, 0.03, 0.09, 0.18), node(3, 5, "STARTER_FATIGUE", 0.28, 0.14, 0.045, 0.1, 0.19), node(4, 7, "BULLPEN", 0.29, 0.18, 0.06, 0.11, 0.2), node(5, 9, "LATE_BULLPEN", 0.28, 0.19, 0.07, 0.12, 0.22)]
        : profile === "k"
          ? [node(1, 1, "STARTER_FRESH", 0.19, 0.07, 0.02, 0.06, 0.36), node(2, 3, "STARTER_SECOND_LOOK", 0.2, 0.08, 0.025, 0.07, 0.33), node(3, 5, "STARTER_FATIGUE", 0.23, 0.12, 0.04, 0.08, 0.31), node(4, 7, "BULLPEN", 0.22, 0.13, 0.045, 0.09, 0.34)]
          : [node(1, 1, "STARTER_FRESH", 0.29, 0.08, 0.015, 0.13, 0.12), node(2, 3, "STARTER_SECOND_LOOK", 0.31, 0.09, 0.02, 0.13, 0.11), node(3, 5, "STARTER_FATIGUE", 0.3, 0.1, 0.025, 0.14, 0.12), node(4, 7, "BULLPEN", 0.28, 0.11, 0.03, 0.15, 0.15)];
  const bestHitWindow = [...nodes].sort((a, b) => b.hitProbability - a.hitProbability)[0];
  const bestPowerWindow = [...nodes].sort((a, b) => b.homeRunProbability - a.homeRunProbability || b.extraBaseHitProbability - a.extraBaseHitProbability)[0];
  const highestStrikeoutRiskWindow = [...nodes].sort((a, b) => b.strikeoutProbability - a.strikeoutProbability)[0];
  return {
    playerId: id,
    playerName: name,
    team,
    battingOrder: order,
    expectedPlateAppearances: nodes.length,
    latePaChance: profile === "late" ? 0.62 : profile === "power" ? 0.38 : 0.24,
    bestHitWindow,
    bestPowerWindow,
    highestStrikeoutRiskWindow,
    bullpenExposureShare: nodes.filter((n) => n.pitcherRole === "BULLPEN").length / nodes.length,
    summary: `${name} test path`,
    plateAppearances: nodes
  };
}

function box(id: string, name: string, team: string, order: number, impact: number, confidence = 0.72, volatility = 1.1): MlbSimulatedHitterBoxScore {
  return {
    playerId: id,
    playerName: name,
    team,
    battingOrder: order,
    impactScore: impact,
    confidence,
    volatility
  } as MlbSimulatedHitterBoxScore;
}

const paths = [
  path("hit", "Hit Window", "CHC", 1, "hit"),
  path("power", "Power Window", "CHC", 2, "power"),
  path("late", "Late PA", "STL", 3, "late"),
  path("k", "K Trap", "STL", 4, "k"),
  path("safe", "Safe Contact", "CHC", 5, "safe")
];

const boxScore = {
  awayTeam: { team: "CHC", hitters: [box("hit", "Hit Window", "CHC", 1, 38), box("power", "Power Window", "CHC", 2, 46, 0.7, 1.55), box("safe", "Safe Contact", "CHC", 5, 31, 0.8, 0.9)] },
  homeTeam: { team: "STL", hitters: [box("late", "Late PA", "STL", 3, 36), box("k", "K Trap", "STL", 4, 24, 0.55, 1.25)] }
} as MlbSimulatedGameBoxScore;

const plateAppearanceScript = {
  modelVersion: "mlb-plate-appearance-game-script-v1",
  awayTeam: { team: "CHC", opponentTeam: "STL", paths: paths.filter((p) => p.team === "CHC") },
  homeTeam: { team: "STL", opponentTeam: "CHC", paths: paths.filter((p) => p.team === "STL") },
  topPlateAppearancePaths: paths,
  summary: "test"
} as MlbGamePlateAppearanceScript;

const ranking = buildMlbPaWindowRanking({ boxScore, plateAppearanceScript });
assert.equal(ranking.modelVersion, "mlb-pa-window-ranking-v1");
assert.ok(ranking.overall.length > 0);
assert.ok(ranking.bestHitWindows.length > 0);
assert.ok(ranking.bestPowerWindows.length > 0);
assert.ok(ranking.bullpenExposureUpside.length > 0);
assert.ok(ranking.latePaUpside.length > 0);
assert.ok(ranking.kRiskTraps.length > 0);
assert.ok(ranking.safestContact.length > 0);
assert.equal(ranking.bestHitWindows[0].playerName, "Hit Window");
assert.equal(ranking.bestPowerWindows[0].playerName, "Power Window");
assert.equal(ranking.latePaUpside[0].playerName, "Late PA");
assert.equal(ranking.kRiskTraps[0].playerName, "K Trap");
assert.equal(ranking.safestContact[0].playerName, "Safe Contact");
assert.ok(ranking.overall[0].rank === 1);
assert.ok(ranking.overall[0].score >= ranking.overall[ranking.overall.length - 1].score);
assert.ok(ranking.summary.includes("PA-window ranking"));
assert.ok(ranking.overall[0].drivers.length > 0);

console.log("mlb-pa-window-ranking.test.ts passed");
