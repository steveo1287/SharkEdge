import assert from "node:assert/strict";

import {
  buildRollingMlbEloSnapshots,
  eloExpectedWinProbability,
  updateMlbEloRatings
} from "@/services/data/retrosheet/feature-builder";

assert.equal(eloExpectedWinProbability(1500, 1500), 0.5);

const winUpdate = updateMlbEloRatings({
  homeRating: 1500,
  awayRating: 1500,
  homeScore: 5,
  awayScore: 3
});
assert.ok(winUpdate.homePost > 1500);
assert.ok(winUpdate.awayPost < 1500);
assert.equal(winUpdate.kFactor, 4);

const lossUpdate = updateMlbEloRatings({
  homeRating: 1500,
  awayRating: 1500,
  homeScore: 2,
  awayScore: 4,
  isPostseason: true
});
assert.ok(lossUpdate.homePost < 1500);
assert.equal(lossUpdate.kFactor, 6);

const snapshots = buildRollingMlbEloSnapshots([
  {
    retrosheetGameId: "BOS202504010",
    gameDate: new Date("2025-04-01T00:00:00.000Z"),
    season: 2025,
    homeTeamId: "BOS",
    awayTeamId: "NYY",
    homeScore: 5,
    awayScore: 3
  },
  {
    retrosheetGameId: "NYY202504020",
    gameDate: new Date("2025-04-02T00:00:00.000Z"),
    season: 2025,
    homeTeamId: "NYY",
    awayTeamId: "BOS",
    homeScore: 6,
    awayScore: 2
  }
]);

assert.equal(snapshots.length, 4);
assert.ok(snapshots[0].postGameElo > snapshots[0].preGameElo);
assert.ok(snapshots[2].preGameElo < 1500);
assert.ok(snapshots[2].postGameElo > snapshots[2].preGameElo);

console.log("retrosheet-feature-builder tests passed");
