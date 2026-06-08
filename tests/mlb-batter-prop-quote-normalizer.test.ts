import assert from "node:assert/strict";

import { normalizeMlbBatterPropQuotes } from "@/services/simulation/mlb-batter-prop-quote-normalizer";

const result = normalizeMlbBatterPropQuotes([
  {
    sportsbook: "DraftKings",
    participant_id: "p-1",
    participantName: "Test Hitter",
    teamAbbr: "CHC",
    marketType: "player hits",
    selection: "over",
    points: "0.5",
    price: "-145",
    lastUpdated: "2026-06-07T12:00:00Z"
  },
  {
    provider: "FanDuel",
    playerName: "Power Bat",
    playerTeam: "STL",
    prop: "total bases",
    outcome: "Under",
    line: 1.5,
    americanOdds: 120
  },
  {
    book: "BetMGM",
    mlbId: 12345,
    name: "HR Bat",
    stat: "HR",
    side: "YES",
    value: 0.5,
    odds: 900,
    available: true
  },
  {
    book: "BadBook",
    playerName: "No Market",
    market: "unsupported prop",
    side: "over",
    line: 0.5,
    odds: 100
  },
  {
    book: "BadBook",
    market: "hits",
    side: "over",
    line: 0.5,
    odds: 100
  },
  "not-an-object"
]);

assert.equal(result.modelVersion, "mlb-batter-prop-quote-normalizer-v1");
assert.equal(result.quotes.length, 3);
assert.equal(result.rejected.length, 3);
assert.ok(result.warnings.some((warning) => warning.includes("rejected")));

const hits = result.quotes[0];
assert.equal(hits.book, "DraftKings");
assert.equal(hits.playerId, "p-1");
assert.equal(hits.playerName, "Test Hitter");
assert.equal(hits.team, "CHC");
assert.equal(hits.market, "HITS");
assert.equal(hits.side, "OVER");
assert.equal(hits.line, 0.5);
assert.equal(hits.americanOdds, -145);
assert.equal(hits.updatedAt, "2026-06-07T12:00:00Z");

const totalBases = result.quotes[1];
assert.equal(totalBases.book, "FanDuel");
assert.equal(totalBases.market, "TOTAL_BASES");
assert.equal(totalBases.side, "UNDER");
assert.equal(totalBases.americanOdds, 120);

const hr = result.quotes[2];
assert.equal(hr.book, "BetMGM");
assert.equal(hr.playerId, "12345");
assert.equal(hr.market, "HOME_RUN");
assert.equal(hr.side, "OVER");
assert.equal(hr.available, true);

const nonArray = normalizeMlbBatterPropQuotes({ bad: true });
assert.equal(nonArray.quotes.length, 0);
assert.ok(nonArray.warnings.some((warning) => warning.includes("not an array")));

console.log("mlb-batter-prop-quote-normalizer.test.ts passed");
