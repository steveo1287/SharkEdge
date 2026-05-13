import assert from "node:assert/strict";

import { americanWinProfit, gradeTrendRow, rowMatchesFilter, summarizeBacktestRows } from "../src/server/sharktrends/backtest-engine";
import type { SharkTrendContextRow } from "../src/server/sharktrends/types";

function row(overrides: Partial<SharkTrendContextRow>): SharkTrendContextRow {
  return {
    eventId: "e1",
    sourceKey: "sportsbookreview_historical",
    season: 2024,
    gameDate: "2024-06-01T00:00:00Z",
    startTime: "2024-06-01T00:00:00Z",
    teamCompetitorId: "t1",
    teamName: "Chicago Cubs",
    opponentName: "Cardinals",
    isHome: true,
    side: "HOME",
    marketType: "moneyline",
    oddsAmerican: -150,
    closingOddsAmerican: -160,
    wonGame: true,
    isFavorite: true,
    dataQualityScore: 80,
    ...overrides
  };
}

assert.equal(Number(americanWinProfit(150).toFixed(2)), 1.5);
assert.equal(Number(americanWinProfit(-200).toFixed(2)), 0.5);
assert.equal(gradeTrendRow(row({ wonGame: true })), "WIN");
assert.equal(gradeTrendRow(row({ wonGame: false })), "LOSS");
assert.equal(gradeTrendRow(row({ marketType: "total", side: "UNDER", ouResult: "PUSH" })), "PUSH");

const rows = [row({ oddsAmerican: -150, wonGame: true }), row({ oddsAmerican: 140, wonGame: false, isFavorite: false, isUnderdog: true }), row({ marketType: "total", side: "OVER", ouResult: "PUSH" })];
const summary = summarizeBacktestRows(rows, { league: "MLB" }, true, 10);
assert.equal(summary.result.sampleSize, 3);
assert.equal(summary.result.wins, 1);
assert.equal(summary.result.losses, 1);
assert.equal(summary.result.pushes, 1);
assert.equal(summary.matches.length, 3);
assert.equal(rowMatchesFilter(row({}), { league: "MLB", team: "Cubs", marketType: "moneyline", side: "FAVORITE" }), true);
console.log("sharktrends-backtest-engine tests passed");
