import assert from "node:assert/strict";

import { buildMlbSimulatedPitchingBoxScores } from "@/services/simulation/mlb-simulated-pitching-box-score";
import type { MlbPlayerStatProjectionGame, MlbStarterPerGameProjection } from "@/services/simulation/mlb-player-stat-inning-engine";

function starter(id: string, name: string, team: string, ip: number, k: number, er: number): MlbStarterPerGameProjection {
  return {
    pitcherId: id,
    pitcherName: name,
    team,
    expectedInningsPitched: ip,
    expectedOuts: ip * 3,
    expectedStrikeouts: k,
    expectedEarnedRuns: er,
    expectedHitsAllowed: 5.2,
    expectedWalksAllowed: 1.7,
    expectedHomeRunsAllowed: 0.7,
    qualityStartProbability: 0.46,
    over17_5OutsProbability: ip >= 5.85 ? 0.62 : 0.4,
    over4_5StrikeoutsProbability: k >= 4.5 ? 0.65 : 0.42,
    firstFiveRunsAllowed: er * 0.82,
    confidence: 0.74,
    reasons: [`${name} test starter reason.`]
  };
}

const projection: MlbPlayerStatProjectionGame = {
  modelVersion: "mlb-player-stat-projection-v1",
  awayTeam: "CHC",
  homeTeam: "STL",
  awayHitters: [],
  homeHitters: [],
  awayStarter: starter("sp1", "Away Starter", "CHC", 5.8, 6.1, 2.4),
  homeStarter: starter("sp2", "Home Starter", "STL", 5.2, 4.2, 3.1),
  warnings: []
};

const pitching = buildMlbSimulatedPitchingBoxScores({
  projection,
  awayOffense: {
    team: "CHC",
    projectedRuns: 4.6,
    plateAppearances: 39.4,
    hits: 8.7,
    totalBases: 14.4,
    homeRuns: 1.15,
    walks: 3.2,
    strikeouts: 7.9
  },
  homeOffense: {
    team: "STL",
    projectedRuns: 3.8,
    plateAppearances: 37.2,
    hits: 7.6,
    totalBases: 12.1,
    homeRuns: 0.85,
    walks: 2.8,
    strikeouts: 8.4
  }
});

assert.equal(pitching.awayPitching.team, "CHC");
assert.equal(pitching.homePitching.team, "STL");
assert.ok(pitching.awayPitching.starter);
assert.ok(pitching.homePitching.starter);
assert.equal(pitching.awayPitching.starter!.role, "STARTER");
assert.equal(pitching.awayPitching.bullpen.role, "BULLPEN");
assert.ok(pitching.awayPitching.totals.inningsPitched >= 8.9);
assert.ok(pitching.homePitching.totals.inningsPitched >= 8.9);
assert.ok(pitching.awayPitching.totals.strikeouts > 0);
assert.ok(pitching.homePitching.totals.hitsAllowed > 0);
assert.ok(pitching.awayPitching.exposure.expectedBullpenInnings > 0);
assert.ok(["HIGH", "MEDIUM", "LOW"].includes(pitching.awayPitching.exposure.earlyHookRisk));
assert.ok(["AWAY", "HOME", "EVEN", "UNKNOWN"].includes(pitching.pitchingMatchup.starterAdvantage));
assert.ok(pitching.pitchingMatchup.summary.includes("Pitching read"));
assert.ok(pitching.reconciliation.overallAlignment >= 0.98);
assert.ok(pitching.reconciliation.summary.includes("Batter/pitcher reconciliation"));
assert.equal(Math.round(pitching.homePitching.totals.earnedRuns * 10) / 10, 4.6);
assert.equal(Math.round(pitching.awayPitching.totals.earnedRuns * 10) / 10, 3.8);

console.log("mlb-simulated-pitching-box-score.test.ts passed");
