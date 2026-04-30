import assert from "node:assert/strict";

import { buildRollingMlbEloSnapshots } from "@/services/data/retrosheet/feature-builder";

const snapshots = buildRollingMlbEloSnapshots([
  {
    retrosheetGameId: "BOS202504010",
    gameDate: new Date("2025-04-01T00:00:00.000Z"),
    season: 2025,
    homeTeamId: "BOS",
    awayTeamId: "NYY",
    homeScore: 5,
    awayScore: 2
  },
  {
    retrosheetGameId: "NYY202504020",
    gameDate: new Date("2025-04-02T00:00:00.000Z"),
    season: 2025,
    homeTeamId: "NYY",
    awayTeamId: "BOS",
    homeScore: 4,
    awayScore: 3
  }
]);

assert.equal(snapshots.length, 4);
assert.ok(snapshots.every((row) => Number.isFinite(row.preGameElo) && Number.isFinite(row.postGameElo)));

console.log("warehouse-feeder-row-counts tests passed");
