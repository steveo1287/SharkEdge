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

console.log("All book feed normalization tests passed.");
