import assert from "node:assert/strict";

import { evaluateLiveQualifier } from "../src/server/sharktrends/live-qualifiers";
import type { SharkTrendContextRow } from "../src/server/sharktrends/types";

const row: SharkTrendContextRow = {
  eventId: "evt",
  sourceKey: "live",
  season: 2026,
  gameDate: "2026-06-01T00:00:00Z",
  startTime: "2026-06-01T00:00:00Z",
  teamCompetitorId: "cubs",
  teamName: "Chicago Cubs",
  opponentName: "Cardinals",
  isHome: true,
  side: "HOME",
  marketType: "moneyline",
  oddsAmerican: -160,
  closingOddsAmerican: -160,
  isFavorite: true,
  isUnderdog: false,
  dataQualityScore: 50,
  dataWarnings: []
};

assert.ok(evaluateLiveQualifier(row, { league: "MLB", marketType: "moneyline", side: "FAVORITE", homeAway: "HOME" }));
assert.equal(evaluateLiveQualifier(row, { league: "MLB", windOut: true }), null);
console.log("sharktrends-live-qualifiers tests passed");
