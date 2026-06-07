import assert from "node:assert/strict";

import {
  actualInningStatForMarket,
  actualPlayerStatForMarket,
  buildMlbInningProjectionRows,
  buildMlbPlayerPropProjectionRows,
  gradeMlbInningProjectionRow,
  gradeMlbPlayerPropRow
} from "@/services/simulation/mlb-player-prop-inning-ledgers";
import type { MlbInningMarketProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

const playerProjection: MlbPlayerStatProjectionGame = {
  modelVersion: "mlb-player-stat-projection-v1",
  awayTeam: "AWY",
  homeTeam: "HME",
  awayHitters: [{
    playerId: "a1",
    playerName: "Away Leadoff",
    team: "AWY",
    battingOrder: 1,
    expectedPlateAppearances: 4.8,
    hitProbability: 0.72,
    expectedHits: 1.18,
    expectedTotalBases: 1.88,
    expectedHomeRuns: 0.18,
    expectedRuns: 0.74,
    expectedRbi: 0.51,
    expectedWalks: 0.42,
    expectedStrikeouts: 0.88,
    stealAttemptProbability: 0.11,
    stolenBaseProbability: 0.08,
    confidence: 0.84,
    reasons: []
  }],
  homeHitters: [{
    playerId: "h1",
    playerName: "Home Slugger",
    team: "HME",
    battingOrder: 4,
    expectedPlateAppearances: 4.5,
    hitProbability: 0.68,
    expectedHits: 1.02,
    expectedTotalBases: 2.2,
    expectedHomeRuns: 0.28,
    expectedRuns: 0.62,
    expectedRbi: 0.91,
    expectedWalks: 0.36,
    expectedStrikeouts: 1.05,
    stealAttemptProbability: 0.02,
    stolenBaseProbability: 0.01,
    confidence: 0.82,
    reasons: []
  }],
  awayStarter: {
    pitcherId: "asp",
    pitcherName: "Away Starter",
    team: "AWY",
    expectedInningsPitched: 5.8,
    expectedOuts: 17.4,
    expectedStrikeouts: 5.7,
    expectedEarnedRuns: 2.4,
    expectedHitsAllowed: 5.1,
    expectedWalksAllowed: 1.8,
    expectedHomeRunsAllowed: 0.7,
    qualityStartProbability: 0.44,
    over17_5OutsProbability: 0.49,
    over4_5StrikeoutsProbability: 0.71,
    firstFiveRunsAllowed: 2.1,
    confidence: 0.86,
    reasons: []
  },
  homeStarter: null,
  warnings: []
};

const propRows = buildMlbPlayerPropProjectionRows({
  gameId: "game-1",
  eventLabel: "AWY @ HME",
  startTime: "2026-06-07T18:00:00.000Z",
  projections: playerProjection
});

assert.equal(propRows.length, 13);
assert.ok(propRows.some((row) => row.market === "hitter_hits" && row.playerId === "a1"));
assert.ok(propRows.some((row) => row.market === "pitcher_strikeouts" && row.playerId === "asp"));
assert.ok(propRows.every((row) => row.gameId === "game-1"));

const hitRow = propRows.find((row) => row.market === "hitter_hits" && row.playerId === "a1")!;
assert.equal(actualPlayerStatForMarket(hitRow, { batting: { hits: 2, totalBases: 3, runs: 1, rbi: 0, stolenBases: 1 } }), 2);
assert.deepEqual(gradeMlbPlayerPropRow(hitRow, { batting: { hits: 2 } }).result, "WIN");
assert.deepEqual(gradeMlbPlayerPropRow(hitRow, { batting: { hits: 0 } }).result, "LOSS");

const tbRow = propRows.find((row) => row.market === "hitter_total_bases" && row.playerId === "h1")!;
assert.equal(actualPlayerStatForMarket(tbRow, { TB: 2 }), 2);
assert.equal(gradeMlbPlayerPropRow(tbRow, { TB: 1 }).result, "LOSS");

const outsRow = propRows.find((row) => row.market === "pitcher_outs")!;
assert.equal(actualPlayerStatForMarket(outsRow, { pitching: { inningsPitched: 6 } }), 18);
assert.equal(gradeMlbPlayerPropRow(outsRow, { pitching: { outs: 18 } }).result, "WIN");

const inningProjection: MlbInningMarketProjection = {
  modelVersion: "mlb-inning-market-projection-v1",
  awayTeam: "AWY",
  homeTeam: "HME",
  innings: [
    { inning: 1, awayExpectedRuns: 0.3, homeExpectedRuns: 0.35, expectedRuns: 0.65, noRunProbability: 0.522 },
    { inning: 2, awayExpectedRuns: 0.4, homeExpectedRuns: 0.44, expectedRuns: 0.84, noRunProbability: 0.432 },
    { inning: 3, awayExpectedRuns: 0.4, homeExpectedRuns: 0.48, expectedRuns: 0.88, noRunProbability: 0.415 },
    { inning: 4, awayExpectedRuns: 0.45, homeExpectedRuns: 0.5, expectedRuns: 0.95, noRunProbability: 0.387 },
    { inning: 5, awayExpectedRuns: 0.46, homeExpectedRuns: 0.52, expectedRuns: 0.98, noRunProbability: 0.375 }
  ],
  nrfiProbability: 0.522,
  yrfiProbability: 0.478,
  firstFiveAwayRuns: 2.01,
  firstFiveHomeRuns: 2.29,
  firstFiveTotalRuns: 4.3,
  firstFiveHomeWinProbability: 0.42,
  firstFiveAwayWinProbability: 0.35,
  firstFiveTieProbability: 0.23,
  firstFiveOver4_5Probability: 0.46,
  fullGameExpectedRuns: 8.7,
  warnings: []
};

const inningRows = buildMlbInningProjectionRows({
  gameId: "game-1",
  eventLabel: "AWY @ HME",
  startTime: "2026-06-07T18:00:00.000Z",
  projection: inningProjection
});
assert.equal(inningRows.length, 5);
assert.ok(inningRows.some((row) => row.market === "nrfi"));
assert.ok(inningRows.some((row) => row.market === "first_five_total"));

const nrfi = inningRows.find((row) => row.market === "nrfi")!;
assert.equal(actualInningStatForMarket(nrfi, { resultJson: { innings: [{ away: 0, home: 0 }] } }), 0);
assert.equal(gradeMlbInningProjectionRow(nrfi, { resultJson: { innings: [{ away: 0, home: 0 }] } }).result, "WIN");
assert.equal(gradeMlbInningProjectionRow(nrfi, { resultJson: { innings: [{ away: 1, home: 0 }] } }).result, "LOSS");

const f5Total = inningRows.find((row) => row.market === "first_five_total")!;
assert.equal(actualInningStatForMarket(f5Total, { resultJson: { firstFiveAwayRuns: 3, firstFiveHomeRuns: 2 } }), 5);
assert.equal(gradeMlbInningProjectionRow(f5Total, { resultJson: { firstFiveAwayRuns: 3, firstFiveHomeRuns: 2 } }).result, "WIN");
assert.equal(gradeMlbInningProjectionRow(f5Total, { awayStatsJson: { firstFiveRuns: 1 }, homeStatsJson: { firstFiveRuns: 2 } }).result, "LOSS");

const homeMl = inningRows.find((row) => row.market === "first_five_home_ml")!;
assert.equal(gradeMlbInningProjectionRow(homeMl, { resultJson: { firstFiveAwayRuns: 2, firstFiveHomeRuns: 3 } }).result, "WIN");
assert.equal(gradeMlbInningProjectionRow(homeMl, { resultJson: { firstFiveAwayRuns: 3, firstFiveHomeRuns: 2 } }).result, "LOSS");

console.log("mlb-player-prop-inning-ledgers.test.ts passed");
