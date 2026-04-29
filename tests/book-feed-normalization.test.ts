import assert from "node:assert/strict";

import { normalizeBookFeedPayload } from "@/services/current-odds/book-feed-normalization";

function run(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("normalizes advanced MLB book feed rows into canonical ingest payloads", () => {
  const payloads = normalizeBookFeedPayload({
    providerKey: "draftkings",
    sportsbookKey: "draftkings",
    fetchedAt: "2026-04-08T18:00:00.000Z",
    payload: {
      league: "MLB",
      events: [
        {
          id: "game_123",
          homeTeam: "Chicago Cubs",
          awayTeam: "St. Louis Cardinals",
          commenceTime: "2026-04-08T19:40:00.000Z",
          books: [
            {
              name: "DraftKings",
              fetchedAt: "2026-04-08T18:00:00.000Z",
              markets: [
                {
                  marketType: "moneyline",
                  outcomes: [
                    { selection: "Chicago Cubs", oddsAmerican: -122 },
                    { selection: "St. Louis Cardinals", oddsAmerican: 110 }
                  ]
                },
                {
                  marketType: "total",
                  period: "first_5",
                  outcomes: [
                    { selection: "Over", line: 4.5, oddsAmerican: -108 },
                    { selection: "Under", line: 4.5, oddsAmerican: -112 }
                  ]
                },
                {
                  marketType: "team_total",
                  participantTeam: { name: "Chicago Cubs", side: "home" },
                  outcomes: [
                    { selection: "Over", line: 4.5, oddsAmerican: -105 },
                    { selection: "Under", line: 4.5, oddsAmerican: -115 }
                  ]
                },
                {
                  marketType: "pitcher_strikeouts",
                  participantPlayer: { name: "Shota Imanaga", teamName: "Chicago Cubs" },
                  outcomes: [
                    { selection: "Over", line: 6.5, oddsAmerican: 105 },
                    { selection: "Under", line: 6.5, oddsAmerican: -125 }
                  ]
                },
                {
                  marketType: "pitcher_outs",
                  participantPlayer: { name: "Sonny Gray", teamName: "St. Louis Cardinals" },
                  outcomes: [
                    { selection: "Over", line: 17.5, oddsAmerican: -110 },
                    { selection: "Under", line: 17.5, oddsAmerican: -110 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(payloads.length, 1);
  const event = payloads[0];
  assert.equal(event.source, "draftkings");
  assert.equal(event.homeTeam, "Chicago Cubs");
  assert.equal(event.awayTeam, "St. Louis Cardinals");
  assert.equal(event.lines.length, 1);

  const line = event.lines[0];
  assert.equal(line.book, "DraftKings");
  assert.equal(line.markets?.length, 10);
  assert.equal(line.odds?.homeMoneyline, -122);
  assert.equal(line.odds?.awayMoneyline, 110);

  const firstFiveTotal = line.markets?.find(
    (market) =>
      market.marketType === "total" &&
      market.period === "first_5" &&
      market.side === "over"
  );
  assert.ok(firstFiveTotal);
  assert.equal(firstFiveTotal?.line, 4.5);

  const teamTotal = line.markets?.find(
    (market) =>
      market.marketType === "team_total" &&
      market.selection === "Chicago Cubs" &&
      market.side === "over"
  );
  assert.ok(teamTotal);

  const pitcherKs = line.markets?.find(
    (market) =>
      market.marketType === "player_pitcher_strikeouts" &&
      market.selection === "Shota Imanaga" &&
      market.side === "over"
  );
  assert.ok(pitcherKs);
  assert.equal(pitcherKs?.line, 6.5);

  const pitcherOuts = line.markets?.find(
    (market) =>
      market.marketType === "player_pitcher_outs" &&
      market.selection === "Sonny Gray"
  );
  assert.ok(pitcherOuts);
  assert.equal(pitcherOuts?.line, 17.5);
});

run("passes through canonical line payloads that already include advanced markets", () => {
  const payloads = normalizeBookFeedPayload({
    providerKey: "fanduel",
    sportsbookKey: "fanduel",
    fetchedAt: "2026-04-08T18:05:00.000Z",
    payload: {
      sport: "MLB",
      events: [
        {
          eventKey: "bookfeed:mlb:test",
          homeTeam: "Chicago Cubs",
          awayTeam: "Milwaukee Brewers",
          commenceTime: "2026-04-08T20:10:00.000Z",
          lines: [
            {
              book: "FanDuel",
              fetchedAt: "2026-04-08T18:05:00.000Z",
              odds: {},
              markets: [
                {
                  marketType: "player_pitcher_strikeouts",
                  selection: "Justin Steele",
                  side: "over",
                  line: 5.5,
                  oddsAmerican: -102,
                  period: "full_game",
                  playerName: "Justin Steele"
                }
              ]
            }
          ]
        }
      ]
    }
  });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].source, "fanduel");
  assert.equal(
    payloads[0].lines[0].markets?.[0]?.marketType,
    "player_pitcher_strikeouts"
  );
  assert.equal(payloads[0].lines[0].markets?.[0]?.selection, "Justin Steele");
});

run("normalizes raw Odds API event shape (sport_key, h2h, spreads, totals)", () => {
  // This is the real shape returned by GET /v4/sports/{sport}/odds from the Odds API.
  // Tests the three fixes: sport_key field, h2h → moneyline, spreads → spread.
  const oddsApiPayload = [
    {
      id: "event-abc123",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: "2026-05-01T23:05:00Z",
      home_team: "Chicago Cubs",
      away_team: "St. Louis Cardinals",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          last_update: "2026-05-01T22:00:00Z",
          markets: [
            {
              key: "h2h",
              last_update: "2026-05-01T22:00:00Z",
              outcomes: [
                { name: "Chicago Cubs", price: -135 },
                { name: "St. Louis Cardinals", price: 115 }
              ]
            },
            {
              key: "spreads",
              last_update: "2026-05-01T22:00:00Z",
              outcomes: [
                { name: "Chicago Cubs", price: -110, point: -1.5 },
                { name: "St. Louis Cardinals", price: -110, point: 1.5 }
              ]
            },
            {
              key: "totals",
              last_update: "2026-05-01T22:00:00Z",
              outcomes: [
                { name: "Over", price: -108, point: 8.5 },
                { name: "Under", price: -112, point: 8.5 }
              ]
            }
          ]
        }
      ]
    }
  ];

  const payloads = normalizeBookFeedPayload({
    providerKey: "oddsapi-io",
    sportsbookKey: "draftkings",
    fetchedAt: "2026-05-01T22:00:00Z",
    payload: oddsApiPayload
  });

  assert.equal(payloads.length, 1, "Must produce 1 ingested event");
  const event = payloads[0];
  assert.equal(event.homeTeam, "Chicago Cubs");
  assert.equal(event.awayTeam, "St. Louis Cardinals");
  assert.equal(event.sport, "baseball_mlb", "sport_key field must be picked up");
  assert.equal(event.lines.length, 1, "Must produce 1 book line (DraftKings)");

  const markets = event.lines[0].markets ?? [];
  assert.ok(markets.length >= 6, `Must produce at least 6 markets (h2h×2, spreads×2, totals×2); got ${markets.length}`);

  const moneylines = markets.filter((m) => m.marketType === "moneyline");
  assert.equal(moneylines.length, 2, "h2h must map to 2 moneyline markets (home + away)");
  const homeML = moneylines.find((m) => m.side === "home");
  assert.ok(homeML, "home moneyline must exist");
  assert.equal(homeML!.oddsAmerican, -135, "home moneyline odds must be -135");
  const awayML = moneylines.find((m) => m.side === "away");
  assert.ok(awayML, "away moneyline must exist");
  assert.equal(awayML!.oddsAmerican, 115, "away moneyline odds must be +115");

  const spreads = markets.filter((m) => m.marketType === "spread");
  assert.equal(spreads.length, 2, "spreads must map to 2 spread markets");
  const homeSpread = spreads.find((m) => m.side === "home");
  assert.ok(homeSpread, "home spread must exist");
  assert.equal(homeSpread!.line, -1.5, "home spread line must be -1.5");
  assert.equal(homeSpread!.oddsAmerican, -110);

  const totals = markets.filter((m) => m.marketType === "total");
  assert.equal(totals.length, 2, "totals must map to 2 total markets (over + under)");
  const over = totals.find((m) => m.side === "over");
  assert.ok(over, "over total must exist");
  assert.equal(over!.line, 8.5);
  assert.equal(over!.oddsAmerican, -108);
  const under = totals.find((m) => m.side === "under");
  assert.ok(under, "under total must exist");
  assert.equal(under!.oddsAmerican, -112);
});

console.log("All book feed normalization tests passed.");
