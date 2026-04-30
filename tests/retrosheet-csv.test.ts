import assert from "node:assert/strict";

import { mlbPitcherGameScore } from "@/services/analytics/team-strength/mlb-elo-adjustments";
import {
  parseCsvText,
  validateRetrosheetColumns
} from "@/services/data/retrosheet/csv";

const rows = parseCsvText([
  "game_id,date,season,home_team,away_team,home_score,away_score",
  "BOS202504010,20250401,2025,BOS,NYY,5,3"
].join("\n"));

assert.equal(rows.length, 1);
assert.equal(rows[0].game_id, "BOS202504010");

const validation = validateRetrosheetColumns("gameinfo", Object.keys(rows[0]));
assert.equal(validation.ok, true);
assert.deepEqual(validation.missing, []);

const badValidation = validateRetrosheetColumns("pitching", ["game_id", "team_id"]);
assert.equal(badValidation.ok, false);
assert.ok(badValidation.missing.includes("pitcherId"));
assert.ok(badValidation.missing.includes("outs"));

assert.equal(
  mlbPitcherGameScore({
    strikeouts: 7,
    outs: 18,
    walks: 2,
    hits: 5,
    runs: 2,
    homeRuns: 1
  }),
  57.400000000000006
);

console.log("retrosheet-csv tests passed");
