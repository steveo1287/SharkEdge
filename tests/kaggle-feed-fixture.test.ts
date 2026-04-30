import assert from "node:assert/strict";

import { normalizeDataBallrFixtureRow } from "@/services/nba/databallr-player-feed";

// Kaggle-style column names are common in ad-hoc CSV exports.
const row = normalizeDataBallrFixtureRow({
  player_name: "Jayson Tatum",
  team_abbreviation: "BOS",
  mpg: 36.1,
  usg_pct: 0.302,
  off_epm: 3.8,
  def_epm: 1.1,
  ts_pct: 0.612,
  ast_pct: 0.212,
  reb_pct: 0.118,
  tov_pct: 0.112
});

assert.ok(row);
assert.equal(row?.playerName, "Jayson Tatum");
assert.equal(row?.teamName, "BOS");
assert.equal(row?.projectedMinutes, 36.1);
assert.equal(row?.usageRate, 30.2);
assert.equal(row?.offensiveEpm, 3.8);
assert.equal(row?.defensiveEpm, 1.1);

console.log("kaggle-feed-fixture tests passed");
