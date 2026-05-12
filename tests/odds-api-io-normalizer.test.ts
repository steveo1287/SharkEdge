import assert from "node:assert/strict";

import { normalizeOddsApiIoOdds } from "@/services/data-providers/odds-api-io/normalizer";

const base = { sourceEventId: "63302141", league: "MLB", sport: "baseball", capturedAt: "2026-05-12T16:00:00.000Z" };

const arrayMarkets = normalizeOddsApiIoOdds({
  id: 63302141,
  home: "Cleveland Guardians",
  away: "Los Angeles Angels",
  bookmakers: {
    DraftKings: [
      { name: "ML", odds: [{ home: "1.83", away: "2.05" }] },
      { name: "Total", odds: [{ label: "8.5", hdp: "8.5", over: "1.91", under: "1.91" }] }
    ]
  }
}, base);

assert.equal(arrayMarkets.length, 4);
assert.equal(arrayMarkets.find((row) => row.side === "home")?.marketType, "moneyline");
assert.equal(arrayMarkets.find((row) => row.side === "home")?.price, -120);
assert.equal(arrayMarkets.find((row) => row.side === "away")?.price, 105);
assert.equal(arrayMarkets.find((row) => row.side === "over")?.point, 8.5);

const objectMarkets = normalizeOddsApiIoOdds({
  id: 63302142,
  bookmakers: {
    FanDuel: {
      moneyline: { odds: { home: -135, away: 115 } },
      totals: { name: "Over/Under", odds: { hdp: 7.5, over: -108, under: -112 } }
    }
  }
}, { ...base, sourceEventId: "63302142" });

assert.equal(objectMarkets.length, 4);
assert.equal(objectMarkets.find((row) => row.sportsbookName === "FanDuel" && row.side === "home")?.price, -135);
assert.equal(objectMarkets.find((row) => row.marketType === "total" && row.side === "under")?.price, -112);

const generic = normalizeOddsApiIoOdds({
  markets: [{
    key: "h2h",
    bookmakers: [{ bookmaker: "Bet365", outcomes: [{ name: "New York Yankees", price: "2.40" }] }]
  }]
}, { ...base, sourceEventId: "63302143" });

assert.equal(generic.length, 1);
assert.equal(generic[0].sportsbookName, "Bet365");
assert.equal(generic[0].price, 140);

console.log("odds-api-io-normalizer tests passed");
