import type { BoardSportSectionView, GameCardView, LeagueKey } from "@/lib/types/domain";
import type { OpportunityView } from "@/lib/types/opportunity";
import {
  buildGameMarketOpportunity,
  rankOpportunities
} from "@/services/opportunities/opportunity-service";

export type BoardLeagueScope = LeagueKey | "ALL";
export type BoardDateScope = "today" | "tomorrow" | "upcoming";
export type BoardMarketScope = "all" | "spread" | "moneyline" | "total";
export type BoardSortScope = "edge" | "movement" | "start";
type BoardMarketKey = "spread" | "moneyline" | "total";

export const BOARD_LEAGUE_ITEMS = [
  "ALL",
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
] as const;

export const BOARD_DATE_ITEMS = ["today", "tomorrow", "upcoming"] as const;
export const BOARD_MARKET_ITEMS = ["all", "moneyline", "spread", "total"] as const;
export const BOARD_SORT_ITEMS = ["edge", "movement", "start"] as const;

const MARKET_KEYS: BoardMarketKey[] = ["spread", "moneyline", "total"];

function readValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function getSelectedLeague(value: string | undefined): BoardLeagueScope {
  const candidate = value?.toUpperCase();
  return (BOARD_LEAGUE_ITEMS.find((league) => league === candidate) ?? "ALL") as BoardLeagueScope;
}

function getSelectedDate(value: string | undefined): BoardDateScope {
  return BOARD_DATE_ITEMS.find((item) => item === value) ?? "today";
}

function getSelectedMarket(value: string | undefined): BoardMarketScope {
  return (BOARD_MARKET_ITEMS.find((item) => item === value) ?? "all") as BoardMarketScope;
}

function getSelectedSort(value: string | undefined): BoardSortScope {
  return (BOARD_SORT_ITEMS.find((item) => item === value) ?? "edge") as BoardSortScope;
}

function resolveBoardDate(value: BoardDateScope) {
  if (value === "today") {
    return "today";
  }

  if (value === "upcoming") {
    return "all";
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const year = tomorrow.getFullYear();
  const month = `${tomorrow.getMonth() + 1}`.padStart(2, "0");
  const day = `${tomorrow.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function isVerifiedGame(game: GameCardView) {
  const hasOdds =
    game.spread.bestOdds !== 0 ||
    game.moneyline.bestOdds !== 0 ||
    game.total.bestOdds !== 0;

  const hasMarketLabels =
    Boolean(game.spread.lineLabel && game.spread.lineLabel !== "No market") ||
    Boolean(game.moneyline.lineLabel && game.moneyline.lineLabel !== "No market") ||
    Boolean(game.total.lineLabel && game.total.lineLabel !== "No market");

  return hasOdds || hasMarketLabels;
}

function buildScopedOpportunities(game: GameCardView, marketScope: BoardMarketScope) {
  const marketKeys = marketScope === "all" ? MARKET_KEYS : [marketScope];

  return rankOpportunities<OpportunityView>(
    marketKeys.map((marketType) => buildGameMarketOpportunity(game, marketType))
  );
}

function getLeadOpportunity(game: GameCardView, marketScope: BoardMarketScope) {
  return buildScopedOpportunities(game, marketScope)[0] ?? null;
}

function getLeadMarket(game: GameCardView, marketScope: BoardMarketScope) {
  const leadOpportunity = getLeadOpportunity(game, marketScope);
  if (!leadOpportunity) {
    return marketScope === "all" ? "moneyline" : marketScope;
  }

  return leadOpportunity.marketType === "spread" ||
    leadOpportunity.marketType === "moneyline" ||
    leadOpportunity.marketType === "total"
    ? leadOpportunity.marketType
    : "moneyline";
}

function getLeadScore(game: GameCardView, marketScope: BoardMarketScope) {
  const leadOpportunity = getLeadOpportunity(game, marketScope);
  if (!leadOpportunity) {
    return 0;
  }

  return leadOpportunity.ranking?.compositeScore ?? leadOpportunity.opportunityScore;
}

function getMovementScore(game: GameCardView, marketScope: BoardMarketScope) {
  const leadMarket = marketScope === "all" ? getLeadMarket(game, marketScope) : marketScope;
  return Math.abs(game[leadMarket].movement);
}

function getStartTimestamp(game: GameCardView) {
  return new Date(game.startTime).getTime();
}

function matchesMarketScope(game: GameCardView, marketScope: BoardMarketScope) {
  if (marketScope === "all") {
    return true;
  }

  return game[marketScope].bestOdds !== 0 || Boolean(game[marketScope].lineLabel);
}

function sortVerifiedGames(games: GameCardView[], sortScope: BoardSortScope, marketScope: BoardMarketScope) {
  return [...games].sort((left, right) => {
    if (sortScope === "start") {
      return getStartTimestamp(left) - getStartTimestamp(right);
    }

    if (sortScope === "movement") {
      const movementDelta = getMovementScore(right, marketScope) - getMovementScore(left, marketScope);
      if (movementDelta !== 0) {
        return movementDelta;
      }
    }

    return getLeadScore(right, marketScope) - getLeadScore(left, marketScope);
  });
}

function buildScoreboardItems(sections: BoardSportSectionView[]) {
  return sections
    .flatMap((section) =>
      section.scoreboard.slice(0, 3).map((item) => ({
        section,
        item
      }))
    )
    .slice(0, 12);
}

function buildLeagueSections(sections: BoardSportSectionView[]) {
  return [...sections].sort((left, right) => {
    const leftRank = left.status === "LIVE" ? 0 : left.status === "PARTIAL" ? 1 : 2;
    const rightRank = right.status === "LIVE" ? 0 : right.status === "PARTIAL" ? 1 : 2;

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return right.games.length - left.games.length;
  });
}

function buildMarketMovers(games: GameCardView[], marketScope: BoardMarketScope) {
  return [...games]
    .sort((left, right) => {
      const leftLeadMarket = getLeadMarket(left, marketScope);
      const rightLeadMarket = getLeadMarket(right, marketScope);

      const leftMovement = Math.abs(left[leftLeadMarket].movement);
      const rightMovement = Math.abs(right[rightLeadMarket].movement);

      if (rightMovement !== leftMovement) {
        return rightMovement - leftMovement;
      }

      return getLeadScore(right, marketScope) - getLeadScore(left, marketScope);
    })
    .slice(0, 6);
}

export async function getBoardCommandData(
  searchParams: Record<string, string | string[] | undefined>
) {
  const selectedLeague = getSelectedLeague(readValue(searchParams, "league"));
  const selectedDate = getSelectedDate(readValue(searchParams, "date"));
  const selectedMarket = getSelectedMarket(readValue(searchParams, "market"));
  const selectedSort = getSelectedSort(readValue(searchParams, "sort"));
  const requestedFocusId = readValue(searchParams, "focus");

  const oddsService = await import("@/services/odds/board-service");
  const filters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "all"
  });

  const boardData = await oddsService.getBoardPageData(filters);

  const filteredVerifiedGames = boardData.games
    .filter(isVerifiedGame)
    .filter((game) => matchesMarketScope(game, selectedMarket));

  const verifiedGames = sortVerifiedGames(filteredVerifiedGames, selectedSort, selectedMarket);
  const movers = buildMarketMovers(verifiedGames, selectedMarket);
  const leagueSections = buildLeagueSections(boardData.sportSections);
  const scoreboardItems = buildScoreboardItems(leagueSections);
  const focusedGame =
    verifiedGames.find((game) => game.id === requestedFocusId) ??
    verifiedGames[0] ??
    null;

  return {
    selectedLeague,
    selectedDate,
    selectedMarket,
    selectedSort,
    requestedFocusId,
    focusedGame,
    filters,
    boardData,
    verifiedGames,
    movers,
    leagueSections,
    scoreboardItems
  };
}
