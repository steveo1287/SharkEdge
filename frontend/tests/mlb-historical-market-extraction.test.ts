import {
  extractHistoricalMoneyline,
  extractHistoricalRunline,
  extractHistoricalTotal,
  extractHistoricalTrendMarkets,
  selectBestPregameMarketSnapshot
} from "@/services/trends/mlb-historical-market-extraction";
import type { HistoricalOddsGame } from "@/services/historical-odds/provider-types";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const TEAM_ARGS = {
  homeTeamName: "Chicago Cubs",
  awayTeamName: "St. Louis Cardinals",
  homeCompetitorId: "comp-cubs",
  awayCompetitorId: "comp-cards"
} as const;

const historicalGame: HistoricalOddsGame = {
  id: "historic-game-1",
  commence_time: "2026-04-03T19:20:00.000Z",
  home_team: "Chicago Cubs",
  away_team: "St. Louis Cardinals",
  bookmakers_available: 2,
  bookmakers: [
    {
      key: "draftkings",
      title: "DraftKings",
      markets: {
        moneyline: [
          { name: "Chicago Cubs", price: -132, point: null },
          { name: "St. Louis Cardinals", price: 118, point: null }
        ],
        spread: [
          { name: "Chicago Cubs", price: 136, point: -1.5 },
          { name: "St. Louis Cardinals", price: -152, point: 1.5 }
        ],
        total: [
          { name: "Over", price: -108, point: 8.5 },
          { name: "Under", price: -112, point: 8.5 }
        ]
      }
    },
    {
      key: "fanduel",
      title: "FanDuel",
      markets: {
        moneyline: [
          { name: "Chicago Cubs", price: -130, point: null },
          { name: "St. Louis Cardinals", price: 116, point: null }
        ],
        spread: [],
        total: []
      }
    }
  ]
};

const structuredMarkets = [
  {
    marketType: "moneyline",
    selection: "Chicago Cubs",
    side: "HOME",
    line: null,
    oddsAmerican: -125,
    closingLine: null,
    closingOdds: null,
    currentLine: null,
    currentOdds: null,
    selectionCompetitorId: "comp-cubs",
    isLive: false,
    snapshots: [
      { capturedAt: "2026-04-03T17:00:00.000Z", line: null, oddsAmerican: -118 },
      { capturedAt: "2026-04-03T18:50:00.000Z", line: null, oddsAmerican: -124 },
      { capturedAt: "2026-04-03T19:35:00.000Z", line: null, oddsAmerican: -140 }
    ]
  },
  {
    marketType: "moneyline",
    selection: "St. Louis Cardinals",
    side: "AWAY",
    line: null,
    oddsAmerican: 114,
    closingLine: null,
    closingOdds: null,
    currentLine: null,
    currentOdds: null,
    selectionCompetitorId: "comp-cards",
    isLive: false,
    snapshots: [
      { capturedAt: "2026-04-03T17:00:00.000Z", line: null, oddsAmerican: 106 },
      { capturedAt: "2026-04-03T18:50:00.000Z", line: null, oddsAmerican: 112 },
      { capturedAt: "2026-04-03T19:35:00.000Z", line: null, oddsAmerican: 128 }
    ]
  },
  {
    marketType: "total",
    selection: "Over",
    side: "OVER",
    line: 8.5,
    oddsAmerican: -108,
    closingLine: null,
    closingOdds: null,
    currentLine: null,
    currentOdds: null,
    selectionCompetitorId: null,
    isLive: false,
    snapshots: [
      { capturedAt: "2026-04-03T17:15:00.000Z", line: 8.5, oddsAmerican: -105 },
      { capturedAt: "2026-04-03T19:00:00.000Z", line: 8.5, oddsAmerican: -110 }
    ]
  },
  {
    marketType: "total",
    selection: "Under",
    side: "UNDER",
    line: 8.5,
    oddsAmerican: -112,
    closingLine: null,
    closingOdds: null,
    currentLine: null,
    currentOdds: null,
    selectionCompetitorId: null,
    isLive: false,
    snapshots: [
      { capturedAt: "2026-04-03T17:15:00.000Z", line: 8.5, oddsAmerican: -115 },
      { capturedAt: "2026-04-03T19:00:00.000Z", line: 8.5, oddsAmerican: -110 }
    ]
  }
];

const runlineStructuredMarkets = [
  {
    marketType: "spread",
    selection: "Chicago Cubs",
    side: "HOME",
    line: -1.5,
    oddsAmerican: 142,
    closingLine: -1.5,
    closingOdds: 138,
    currentLine: -1.5,
    currentOdds: 138,
    selectionCompetitorId: "comp-cubs",
    isLive: false,
    snapshots: []
  },
  {
    marketType: "spread",
    selection: "St. Louis Cardinals",
    side: "AWAY",
    line: 1.5,
    oddsAmerican: -150,
    closingLine: 1.5,
    closingOdds: -154,
    currentLine: 1.5,
    currentOdds: -154,
    selectionCompetitorId: "comp-cards",
    isLive: false,
    snapshots: []
  }
];

const scheduledStart = "2026-04-03T19:20:00.000Z";

const snapshot = selectBestPregameMarketSnapshot(
  [
    { capturedAt: "2026-04-03T17:00:00.000Z", line: 8, oddsAmerican: -105 },
    { capturedAt: "2026-04-03T19:10:00.000Z", line: 8.5, oddsAmerican: -110 },
    { capturedAt: "2026-04-03T19:30:00.000Z", line: 9, oddsAmerican: -120 }
  ],
  scheduledStart
);
assert(snapshot?.line === 8.5, "should choose the latest snapshot before first pitch");

const moneyline = extractHistoricalMoneyline({
  structuredMarkets,
  scheduledStart,
  ...TEAM_ARGS
});
assert(moneyline.markets.length === 2, "moneyline extraction should keep the two-sided market");
assert(
  moneyline.markets.find((market) => market.side === "HOME")?.closingOdds === -124,
  "moneyline extraction should use latest pre-start home price"
);
assert(
  moneyline.markets.find((market) => market.side === "AWAY")?.closingOdds === 112,
  "moneyline extraction should use latest pre-start away price"
);

const total = extractHistoricalTotal({
  structuredMarkets,
  scheduledStart,
  ...TEAM_ARGS
});
assert(total.markets.length === 2, "total extraction should keep over and under");
assert(
  total.markets.find((market) => market.side === "OVER")?.closingLine === 8.5,
  "total extraction should keep the closing total line"
);
assert(
  total.markets.find((market) => market.side === "UNDER")?.closingOdds === -110,
  "total extraction should keep the under price"
);

const runline = extractHistoricalRunline({
  structuredMarkets: runlineStructuredMarkets,
  scheduledStart,
  ...TEAM_ARGS
});
assert(runline.markets.length === 2, "runline extraction should keep both sides when present");
assert(
  runline.markets.find((market) => market.side === "HOME")?.closingLine === -1.5,
  "runline extraction should keep the home line"
);

const archivedOnly = extractHistoricalTrendMarkets({
  historicalGame,
  scheduledStart,
  ...TEAM_ARGS
});
assert(
  archivedOnly.sourceByMarketType.moneyline === "archived_historical_bookmaker",
  "archived historical bookmaker payload should be used when structured markets are absent"
);
assert(
  archivedOnly.markets.find((market) => market.marketType === "total" && market.side === "OVER")?.closingOdds === -108,
  "archived payload should extract total prices"
);

const noUsableMarkets = extractHistoricalTrendMarkets({
  structuredMarkets: [
    {
      marketType: "moneyline",
      selection: "Chicago Cubs",
      side: "HOME",
      line: null,
      oddsAmerican: -140,
      closingLine: null,
      closingOdds: null,
      currentLine: null,
      currentOdds: null,
      selectionCompetitorId: "comp-cubs",
      isLive: true,
      snapshots: [
        { capturedAt: "2026-04-03T19:30:00.000Z", line: null, oddsAmerican: -140 }
      ]
    }
  ],
  scheduledStart,
  ...TEAM_ARGS
});
assert(noUsableMarkets.markets.length === 0, "live-only historical candidates should not be labeled as closing");

const incompleteArchived = extractHistoricalTrendMarkets({
  historicalGame: {
    ...historicalGame,
    bookmakers: [
      {
        key: "draftkings",
        title: "DraftKings",
        markets: {
          moneyline: [{ name: "Chicago Cubs", price: -132, point: null }],
          spread: [],
          total: [{ name: "Over", price: -108, point: 8.5 }]
        }
      }
    ]
  },
  scheduledStart,
  ...TEAM_ARGS
});
assert(
  incompleteArchived.markets.filter((market) => market.marketType === "moneyline").length === 1,
  "incomplete archived moneyline data should not fabricate the away side"
);
assert(
  incompleteArchived.markets.filter((market) => market.marketType === "total").length === 1,
  "incomplete archived totals should not fabricate the under side"
);

console.log("mlb-historical-market-extraction tests passed");
