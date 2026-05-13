import assert from "node:assert/strict";

import { buildCandidateFilters, buildDiscoveryFeedFromRows } from "../src/server/sharktrends/discovery-miner";
import type { SharkTrendContextRow } from "../src/server/sharktrends/types";

function row(index: number, overrides: Partial<SharkTrendContextRow> = {}): SharkTrendContextRow {
  const win = index % 4 !== 0;
  return {
    eventId: `e${index}`,
    sourceKey: "sportsbookreview_historical",
    season: 2024,
    gameDate: `2024-06-${String((index % 25) + 1).padStart(2, "0")}T00:00:00Z`,
    startTime: `2024-06-${String((index % 25) + 1).padStart(2, "0")}T20:00:00Z`,
    teamCompetitorId: "cubs",
    opponentCompetitorId: "opp",
    teamName: "Chicago Cubs",
    opponentName: "St. Louis Cardinals",
    isHome: true,
    side: "HOME",
    marketType: "moneyline",
    oddsAmerican: -145,
    closingOddsAmerican: -150,
    isFavorite: true,
    isUnderdog: false,
    wonGame: win,
    teamScore: win ? 5 : 2,
    opponentScore: win ? 3 : 4,
    venue: "Wrigley Field",
    windOut: true,
    windMph: 12,
    gameNumber: 2,
    interleagueGame: true,
    lastGameRunsScored: index % 3 === 0 ? 0 : 2,
    lastGameRunsAllowed: index % 5 === 0 ? 8 : 3,
    lastTwoRunsScored: 5,
    dataQualityScore: 82,
    ...overrides
  };
}

const rows = Array.from({ length: 24 }, (_, index) => row(index));
const candidates = buildCandidateFilters(rows);
assert.ok(candidates.some((candidate) => candidate.filters.team === "Chicago Cubs" && candidate.filters.windOut === true && candidate.filters.windMphMin === 10));
assert.ok(candidates.some((candidate) => candidate.filters.gameNumber === 2));
assert.ok(candidates.some((candidate) => candidate.filters.interleagueGame === true));

const feed = buildDiscoveryFeedFromRows(rows, 10);
assert.ok(feed.cards.length > 0);
assert.ok(feed.cards.some((card) => card.title.includes("Chicago Cubs")));
assert.ok(feed.cards.some((card) => card.conditions.some((condition) => condition.includes("wind"))));
assert.equal(feed.dataGaps.includes("Wind systems are waiting on historical weather fields (`wind_mph`, `wind_out`, `wind_in`)."), false);
console.log("sharktrends-discovery-miner tests passed");
