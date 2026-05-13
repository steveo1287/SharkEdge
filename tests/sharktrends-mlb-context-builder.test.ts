import assert from "node:assert/strict";

import { buildMlbContextRowsFromWarehouse, type WarehouseRow } from "../src/server/sharktrends/mlb-context-builder";

const base: WarehouseRow = {
  event_id: "evt1",
  event_market_id: "mkt1",
  source_key: "sportsbookreview_historical",
  sportsbook_key: "dk",
  sportsbook_name: "DraftKings",
  season: 2024,
  start_time: new Date("2024-06-01T18:00:00Z"),
  venue: "Wrigley Field",
  status: "FINAL",
  market_type: "moneyline",
  side: "HOME",
  selection: "Cubs",
  line: null,
  odds_american: -170,
  implied_probability: 0.63,
  selection_competitor_id: "cubs",
  home_competitor_id: "cubs",
  away_competitor_id: "cards",
  home_name: "Chicago Cubs",
  away_name: "St. Louis Cardinals",
  home_abbr: "CHC",
  away_abbr: "STL",
  home_score: "5",
  away_score: "3",
  winner_competitor_id: "cubs",
  margin: 2,
  total_points: 8,
  ou_result: null,
  cover_result: null,
  opening_line: null,
  opening_odds: -150,
  closing_line: null,
  closing_odds: -170,
  snapshot_count: 2
};

const [moneyline] = buildMlbContextRowsFromWarehouse([base]);
assert.equal(moneyline.wonGame, true);
assert.equal(moneyline.isFavorite, true);
assert.equal(moneyline.moneylineBucket, "favorite -165 to -180");
assert.ok(moneyline.dataQualityScore >= 70);

const [total] = buildMlbContextRowsFromWarehouse([{ ...base, market_type: "total", side: "OVER", selection: "Over", line: 7.5, closing_line: 7.5, odds_american: -110, closing_odds: -110 }]);
assert.equal(total.ouResult, "WIN");
assert.equal(total.totalBucket, "7.5-8");

const [spread] = buildMlbContextRowsFromWarehouse([{ ...base, market_type: "spread", side: "HOME", line: -1.5, closing_line: -1.5 }]);
assert.equal(spread.coverResult, "WIN");
console.log("sharktrends-mlb-context-builder tests passed");
