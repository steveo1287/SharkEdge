import type { CurrentOddsGame } from "@/services/current-odds/provider-types";
import { DefaultMlbBoardNormalizationService } from "@/services/trends/mlb-board-normalization-service";
import { DefaultMlbHistoricalNormalizationService } from "@/services/trends/mlb-historical-normalization-service";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

const historicalService = new DefaultMlbHistoricalNormalizationService();
const boardService = new DefaultMlbBoardNormalizationService();

const historicalInput = {
  id: "game-mlb-1",
  externalEventId: "401814733",
  startTime: "2026-03-29T23:20:00.000Z",
  providerKey: "espn",
  participants: [
    {
      role: "HOME",
      isHome: true,
      score: "8",
      competitorId: "comp-sea",
      competitor: {
        id: "comp-sea",
        name: "Seattle Mariners"
      }
    },
    {
      role: "AWAY",
      isHome: false,
      score: "0",
      competitorId: "comp-cle",
      competitor: {
        id: "comp-cle",
        name: "Cleveland Guardians"
      }
    }
  ],
  eventResult: {
    participantResultsJson: [
      { role: "HOME", score: 8, competitorId: "comp-sea" },
      { role: "AWAY", score: 0, competitorId: "comp-cle" }
    ],
    metadataJson: {
      providerKey: "espn"
    }
  },
  markets: [
    {
      marketType: "moneyline",
      selection: "Seattle Mariners",
      side: "HOME",
      selectionCompetitorId: "comp-sea",
      closingOdds: -125
    },
    {
      marketType: "moneyline",
      selection: "Cleveland Guardians",
      side: "AWAY",
      selectionCompetitorId: "comp-cle",
      closingOdds: 114
    },
    {
      marketType: "spread",
      selection: "Seattle Mariners",
      side: "HOME",
      selectionCompetitorId: "comp-sea",
      closingLine: -1.5,
      closingOdds: 135
    },
    {
      marketType: "spread",
      selection: "Cleveland Guardians",
      side: "AWAY",
      selectionCompetitorId: "comp-cle",
      closingLine: 1.5,
      closingOdds: -150
    },
    {
      marketType: "total",
      selection: "Over",
      side: "OVER",
      closingLine: 7.5,
      closingOdds: -108
    },
    {
      marketType: "total",
      selection: "Under",
      side: "UNDER",
      closingLine: 7.5,
      closingOdds: -112
    }
  ]
};

const boardInput: CurrentOddsGame = {
  id: "mlb-board-1",
  commence_time: "2026-04-04T19:10:00.000Z",
  home_team: "Chicago Cubs",
  away_team: "St. Louis Cardinals",
  bookmakers_available: 2,
  bookmakers: [
    {
      key: "draftkings",
      title: "DraftKings",
      markets: {
        moneyline: [
          { name: "Chicago Cubs", price: -128, point: null },
          { name: "St. Louis Cardinals", price: 116, point: null }
        ],
        spread: [
          { name: "Chicago Cubs", price: 138, point: -1.5 },
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
          { name: "Chicago Cubs", price: -125, point: null },
          { name: "St. Louis Cardinals", price: 114, point: null }
        ],
        spread: [
          { name: "Chicago Cubs", price: 135, point: -1.5 },
          { name: "St. Louis Cardinals", price: -148, point: 1.5 }
        ],
        total: [
          { name: "Over", price: -110, point: 8.5 },
          { name: "Under", price: -110, point: 8.5 }
        ]
      }
    }
  ],
  market_stats: {
    moneyline: [],
    spread: [],
    total: []
  }
};

const historicalResult = historicalService.normalizeHistoricalGames([historicalInput]);
assert(historicalResult.rows.length === 1, "expected one normalized historical row");
assert(historicalResult.rows[0]?.league === "MLB", "historical row should be MLB");
assert(historicalResult.rows[0]?.totalRuns === 8, "historical row should derive total runs");
assert(historicalResult.rows[0]?.homeWon === true, "historical row should derive home winner");
assert(historicalResult.rows[0]?.closingMoneylineHome === -125, "historical row should map home moneyline");
assert(historicalResult.rows[0]?.closingTotal === 7.5, "historical row should map total");

const historicalWarnings = historicalService.normalizeHistoricalGames([
  {
    id: "broken-row",
    startTime: "2026-03-29T23:20:00.000Z",
    participants: [
      { role: "HOME", competitor: { id: "home", name: "Home" } },
      { role: "AWAY", competitor: { id: "away", name: "Away" } }
    ]
  }
]);
assert(
  historicalWarnings.warnings.some((warning) => warning.includes("missing final scores")),
  "historical warnings should summarize missing scores"
);

const boardResult = boardService.normalizeBoardGames([boardInput]);
assert(boardResult.rows.length === 1, "expected one normalized board row");
assert(
  boardResult.rows[0]?.matchup === "St. Louis Cardinals at Chicago Cubs",
  "board row should derive matchup"
);
assert(boardResult.rows[0]?.currentMoneylineHome === -125, "board row should keep best home moneyline");
assert(boardResult.rows[0]?.currentMoneylineAway === 116, "board row should keep best away moneyline");
assert(boardResult.rows[0]?.currentTotal === 8.5, "board row should map total");

const boardWarnings = boardService.normalizeBoardGames([
  {
    id: "broken-board-row"
  }
]);
assert(
  boardWarnings.warnings.some((warning) => warning.includes("no team mapping")),
  "board warnings should summarize missing team mappings"
);

console.log("mlb-trends-normalization tests passed");
