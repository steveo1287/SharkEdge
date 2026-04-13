import assert from "node:assert/strict";

import type { BoardPageData, BoardSportSectionView, GameCardView } from "@/lib/types/domain";
import { selectBoardGamesByStatus } from "@/services/odds/live-board-data";

function createGame(id: string, status: GameCardView["status"]): GameCardView {
  return {
    id,
    externalEventId: id,
    leagueKey: "NBA",
    awayTeam: {
      id: `${id}-away`,
      leagueId: "nba",
      name: "Away Team",
      abbreviation: "AWY",
      externalIds: {}
    },
    homeTeam: {
      id: `${id}-home`,
      leagueId: "nba",
      name: "Home Team",
      abbreviation: "HME",
      externalIds: {}
    },
    startTime: new Date().toISOString(),
    status,
    venue: "Arena",
    selectedBook: null,
    bestBookCount: 3,
    spread: {
      label: "AWY +3.5",
      lineLabel: "AWY +3.5",
      bestBook: "Best available",
      bestOdds: -110,
      movement: 0
    },
    moneyline: {
      label: "AWY ML",
      lineLabel: "AWY ML",
      bestBook: "Best available",
      bestOdds: 120,
      movement: 0
    },
    total: {
      label: "O/U 220.5",
      lineLabel: "O/U 220.5",
      bestBook: "Best available",
      bestOdds: -110,
      movement: 0
    },
    edgeScore: {
      score: 70,
      label: "Strong"
    },
    detailHref: `/game/${id}`
  };
}

function createSection(games: GameCardView[]): BoardSportSectionView {
  return {
    leagueKey: "NBA",
    leagueLabel: "NBA",
    sport: "BASKETBALL",
    status: "LIVE",
    liveScoreProvider: "ESPN",
    currentOddsProvider: "Live board feed",
    historicalOddsProvider: "Historical feed",
    propsStatus: "LIVE",
    propsProviders: [],
    propsNote: "",
    note: "note",
    detail: "detail",
    scoreboardDetail: "scoreboard detail",
    adapterState: "BOARD",
    stale: false,
    games,
    scoreboard: []
  };
}

const sections: BoardPageData["sportSections"] = [
  createSection([
    createGame("live-1", "LIVE"),
    createGame("pregame-1", "PREGAME"),
    createGame("final-1", "FINAL")
  ])
];

assert.deepEqual(
  selectBoardGamesByStatus(sections, "live").map((game) => game.id),
  ["live-1"]
);

assert.deepEqual(
  selectBoardGamesByStatus(sections, "pregame").map((game) => game.id),
  ["pregame-1"]
);

assert.deepEqual(
  selectBoardGamesByStatus(sections, "all").map((game) => game.id),
  ["live-1", "pregame-1", "final-1"]
);

console.log("live-board-data tests passed");
