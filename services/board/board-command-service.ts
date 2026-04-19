import type { BoardSportSectionView, GameCardView, LeagueKey } from "@/lib/types/domain";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

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
  return BOARD_DATE_ITEMS.find((item) => item === value) ?? "upcoming";
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

function getGameMarketPriority(game: GameCardView, marketKey: BoardMarketKey) {
  const market = game[marketKey];
  const rankScore = market.evProfile?.rankScore ?? 0;
  const confidenceScore = market.confidenceScore ?? 0;
  const movementBonus = Math.min(
    12,
    Math.abs(market.movement) * (marketKey === "moneyline" ? 0.35 : 2.5)
  );
  const qualityBonus = market.marketTruth?.qualityScore ?? 0;
  const bestPriceBonus = market.marketIntelligence?.bestPriceFlag ? 8 : 0;

  return rankScore + confidenceScore * 0.45 + qualityBonus * 0.2 + movementBonus + bestPriceBonus;
}

function getLeadMarket(game: GameCardView) {
  return [...MARKET_KEYS].sort(
    (left, right) => getGameMarketPriority(game, right) - getGameMarketPriority(game, left)
  )[0];
}

function getLeadScore(game: GameCardView) {
  return Math.max(
    buildGameMarketOpportunity(game, "spread").opportunityScore,
    buildGameMarketOpportunity(game, "moneyline").opportunityScore,
    buildGameMarketOpportunity(game, "total").opportunityScore
  );
}

function getMovementScore(game: GameCardView, marketScope: BoardMarketScope) {
  if (marketScope !== "all") {
    return Math.abs(game[marketScope].movement);
  }

  return Math.max(
    Math.abs(game.spread.movement),
    Math.abs(game.moneyline.movement),
    Math.abs(game.total.movement)
  );
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

    return getLeadScore(right) - getLeadScore(left);
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
      const leftLeadMarket = marketScope === "all" ? getLeadMarket(left) : marketScope;
      const rightLeadMarket = marketScope === "all" ? getLeadMarket(right) : marketScope;

      const leftMovement = Math.abs(left[leftLeadMarket].movement);
      const rightMovement = Math.abs(right[rightLeadMarket].movement);

      if (rightMovement !== leftMovement) {
        return rightMovement - leftMovement;
      }

      return getLeadScore(right) - getLeadScore(left);
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
  const liveBoardService = await import("@/services/odds/live-board-data");
  const filters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "all"
  });

  const boardData = await liveBoardService.getLiveBoardPageData(filters);

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
