import assert from "node:assert/strict";

import { buildMlbPlateAppearanceGameScript } from "@/services/simulation/mlb-plate-appearance-game-script";
import type { MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";
import type { MlbSimulatedGameBoxScore } from "@/services/simulation/mlb-simulated-box-score";
import type { MlbSimulatedTeamPitchingBoxScore } from "@/services/simulation/mlb-simulated-pitching-box-score";

function hitter(id: string, name: string, team: string, order: number, boost = 0) {
  return {
    playerId: id,
    playerName: name,
    team,
    battingOrder: order,
    expectedPlateAppearances: 4.65 - order * 0.04,
    expectedHits: 0.95 + boost,
    expectedTotalBases: 1.45 + boost * 2,
    expectedHomeRuns: 0.09 + boost * 0.18,
    expectedRuns: 0.52 + boost * 0.5,
    expectedRbi: 0.5 + boost * 0.55,
    expectedWalks: 0.34 + boost * 0.1,
    expectedStrikeouts: 0.88 - boost * 0.1,
    statDistribution: {
      homeRunProbability: 0.09 + boost * 0.16,
      totalBases4PlusProbability: 0.14 + boost * 0.22
    }
  };
}

function boxHitter(raw: ReturnType<typeof hitter>) {
  return {
    playerId: raw.playerId,
    playerName: raw.playerName,
    team: raw.team,
    battingOrder: raw.battingOrder,
    confidence: 0.74,
    expected: {
      plateAppearances: raw.expectedPlateAppearances,
      hits: raw.expectedHits,
      totalBases: raw.expectedTotalBases,
      homeRuns: raw.expectedHomeRuns,
      runs: raw.expectedRuns,
      rbi: raw.expectedRbi,
      walks: raw.expectedWalks,
      strikeouts: raw.expectedStrikeouts
    }
  };
}

function pitching(team: string, opponent: string, starterIp: number, bullpenIp: number): MlbSimulatedTeamPitchingBoxScore {
  return {
    team,
    opponentTeam: opponent,
    starter: {
      pitcherId: `${team}-sp`,
      pitcherName: `${team} Starter`,
      team,
      role: "STARTER",
      expected: {
        inningsPitched: starterIp,
        outs: starterIp * 3,
        battersFaced: starterIp * 4.2,
        pitchCount: starterIp * 16,
        hitsAllowed: 5,
        earnedRuns: 2.4,
        walksAllowed: 1.5,
        strikeouts: 5.8,
        homeRunsAllowed: 0.7,
        totalBasesAllowed: 8.1
      },
      labels: { leash: "NORMAL", runRisk: "MEDIUM", strikeoutPressure: "HIGH", homeRunRisk: "MEDIUM", trafficRisk: "MEDIUM" },
      probabilities: { qualityStart: 0.45, over17_5Outs: 0.58, over4_5Strikeouts: 0.63 },
      confidence: 0.72,
      summary: "test starter",
      reasons: []
    },
    bullpen: {
      pitcherId: null,
      pitcherName: `${team} bullpen`,
      team,
      role: "BULLPEN",
      expected: {
        inningsPitched: bullpenIp,
        outs: bullpenIp * 3,
        battersFaced: bullpenIp * 4.4,
        pitchCount: bullpenIp * 17,
        hitsAllowed: 3,
        earnedRuns: 1.6,
        walksAllowed: 1.2,
        strikeouts: 3.1,
        homeRunsAllowed: 0.4,
        totalBasesAllowed: 5.2
      },
      labels: { leash: "UNKNOWN", runRisk: "MEDIUM", strikeoutPressure: "MEDIUM", homeRunRisk: "MEDIUM", trafficRisk: "MEDIUM" },
      probabilities: { qualityStart: null, over17_5Outs: null, over4_5Strikeouts: null },
      confidence: 0.55,
      summary: "test bullpen",
      reasons: []
    },
    totals: {
      inningsPitched: starterIp + bullpenIp,
      outs: (starterIp + bullpenIp) * 3,
      battersFaced: starterIp * 4.2 + bullpenIp * 4.4,
      pitchCount: starterIp * 16 + bullpenIp * 17,
      hitsAllowed: 8,
      earnedRuns: 4,
      walksAllowed: 2.7,
      strikeouts: 8.9,
      homeRunsAllowed: 1.1,
      totalBasesAllowed: 13.3
    },
    exposure: {
      starterShareOfBattersFaced: 0.62,
      bullpenShareOfBattersFaced: 0.38,
      expectedBullpenInnings: bullpenIp,
      earlyHookRisk: "MEDIUM",
      timesThroughOrderPenalty: "MEDIUM"
    },
    summary: "test pitching"
  };
}

const awayHitters = Array.from({ length: 9 }, (_, index) => hitter(`a${index + 1}`, `Away ${index + 1}`, "CHC", index + 1, index === 2 ? 0.28 : 0.03));
const homeHitters = Array.from({ length: 9 }, (_, index) => hitter(`h${index + 1}`, `Home ${index + 1}`, "STL", index + 1, index === 0 ? 0.32 : 0.02));

const projection = {
  modelVersion: "mlb-player-stat-projection-v1",
  awayTeam: "CHC",
  homeTeam: "STL",
  awayHitters,
  homeHitters,
  awayStarter: null,
  homeStarter: null,
  warnings: []
} as unknown as MlbPlayerStatProjectionGame;

const boxScore = {
  modelVersion: "mlb-simulated-box-score-v2",
  awayTeam: {
    team: "CHC",
    hitters: awayHitters.map(boxHitter),
    totals: { projectedRuns: 4.8 }
  },
  homeTeam: {
    team: "STL",
    hitters: homeHitters.map(boxHitter),
    totals: { projectedRuns: 4.2 }
  }
} as unknown as MlbSimulatedGameBoxScore;

const script = buildMlbPlateAppearanceGameScript({
  projection,
  boxScore,
  awayPitching: pitching("CHC", "STL", 5.7, 3.3),
  homePitching: pitching("STL", "CHC", 5.2, 3.8)
});

assert.equal(script.modelVersion, "mlb-plate-appearance-game-script-v1");
assert.equal(script.awayTeam.team, "CHC");
assert.equal(script.homeTeam.team, "STL");
assert.equal(script.awayTeam.paths.length, 9);
assert.equal(script.homeTeam.paths.length, 9);
assert.ok(script.awayTeam.starterHandoffInning >= 4);
assert.ok(script.homeTeam.bullpenExposureBeginsInning >= 4);
assert.ok(script.awayTeam.averageLatePaChance > 0);
assert.ok(script.awayTeam.bullpenExposureShare >= 0);
assert.ok(script.awayTeam.latePaCandidates.length > 0);
assert.ok(script.awayTeam.bullpenUpsideHitters.length > 0);
assert.ok(script.topPlateAppearancePaths.length === 10);
assert.ok(script.summary.includes("bullpen exposure"));

const top = script.topPlateAppearancePaths[0];
assert.ok(top.plateAppearances.length >= 4);
assert.ok(top.bestHitWindow.hitProbability > 0);
assert.ok(top.bestPowerWindow.homeRunProbability > 0);
assert.ok(top.highestStrikeoutRiskWindow.strikeoutProbability > 0);
assert.ok(top.summary.includes("best hit"));
assert.ok(top.plateAppearances.some((pa) => pa.pitcherRole === "STARTER"));
assert.ok(top.plateAppearances.some((pa) => pa.pitcherRole === "BULLPEN"));
for (const pa of top.plateAppearances) {
  const total = pa.hitProbability + pa.walkProbability + pa.strikeoutProbability + pa.ballInPlayOutProbability;
  assert.ok(total >= 0.92 && total <= 1.08, `probability total out of range: ${total}`);
  assert.ok(pa.inning >= 1 && pa.inning <= 9);
  assert.ok(["CONTACT", "CONTACT_PLUS", "POWER", "WALK", "STRIKEOUT_RISK", "VOLATILE"].includes(pa.bestOutcome));
}

console.log("mlb-plate-appearance-game-script.test.ts passed");
