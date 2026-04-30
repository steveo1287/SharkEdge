import assert from "node:assert/strict";

import {
  MLB_HOME_FIELD_ELO,
  mlbHomeFieldAdjustment,
  mlbPitcherGameScore,
  mlbPregameEloAdjustment,
  mlbRestAdjustment,
  mlbStartingPitcherAdjustment,
  mlbTravelAdjustment
} from "@/services/analytics/team-strength/mlb-elo-adjustments";

const gameScore = mlbPitcherGameScore({
  strikeouts: 8,
  outs: 21,
  walks: 2,
  hits: 4,
  runs: 1,
  homeRuns: 1
});
assert.equal(Number(gameScore.toFixed(1)), 67.9);

assert.equal(mlbHomeFieldAdjustment({ isHome: true }), MLB_HOME_FIELD_ELO);
assert.equal(mlbHomeFieldAdjustment({ isHome: false }), 0);
assert.equal(mlbHomeFieldAdjustment({ isHome: true, noFans: true }), 9.6);

const travel = mlbTravelAdjustment(1000);
assert.ok(travel < 0);
assert.ok(travel >= -4);
assert.equal(mlbTravelAdjustment(null), 0);

assert.equal(mlbRestAdjustment(1), 2.3);
assert.equal(mlbRestAdjustment(10), 6.9);
assert.equal(mlbRestAdjustment(null), 0);

assert.equal(mlbStartingPitcherAdjustment({ pitcherRollingGameScore: 56, teamRollingGameScore: 50 }), 28.200000000000003);
assert.equal(mlbStartingPitcherAdjustment({ pitcherRollingGameScore: 56, teamRollingGameScore: 50, isOpener: true }), 0);

const full = mlbPregameEloAdjustment({
  isHome: true,
  milesTraveled: 1000,
  restDays: 2,
  pitcherRollingGameScore: 55,
  teamRollingGameScore: 51
});
assert.ok(full.totalAdjustment > 30);
assert.ok(full.notes.some((note) => note.includes("Home-field Elo")));
assert.ok(full.notes.some((note) => note.includes("Starting pitcher Elo")));
assert.throws(() => mlbPitcherGameScore({ strikeouts: -1, outs: 21, walks: 2, hits: 4, runs: 1, homeRuns: 1 }));

console.log("mlb-elo-adjustments tests passed");
