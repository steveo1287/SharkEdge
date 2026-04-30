import assert from "node:assert/strict";

import { normalizeNbaStatsApiAdvancedFixtureRow } from "@/services/nba/nba-stats-api-feed";

const row = normalizeNbaStatsApiAdvancedFixtureRow({
  TEAM_NAME: "Boston Celtics",
  TEAM_ABBREVIATION: "BOS",
  TEAM_ID: 1610612738,
  GP: 82,
  W: 61,
  L: 21,
  OFF_RATING: 121.4,
  DEF_RATING: 110.2,
  PACE: 98.6,
  EFG_PCT: 0.578
});

assert.ok(row);
assert.equal(row?.teamName, "Boston Celtics");
assert.equal(row?.teamAbbreviation, "BOS");
assert.equal(row?.offensiveRating, 121.4);
assert.equal(row?.defensiveRating, 110.2);
assert.equal(row?.pace, 98.6);
assert.equal(row?.efgPct, 57.8);

console.log("nba-api-feed-fixture tests passed");
