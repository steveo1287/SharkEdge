import type { BoardSportSectionView, GameCardView, LeagueKey } from "@/lib/types/domain";
import { buildGameMarketOpportunity } from "@/services/opportunities/opportunity-service";

export type BoardLeagueScope = LeagueKey | "ALL";
export type BoardDateScope = "today" | "tomorrow" | "upcoming";
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
  return (
    game.bestBookCount > 0 &&
    (game.spread.bestOdds !== 0 ||
      game.moneyline.bestOdds !== 0 ||
      game.total.bestOdds !== 0)
  );
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

function getLeadMarket(game: GameCardView): BoardMarketKey {
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

function buildMarketMovers(games: GameCardView[]) {
  return [...games]
    .sort((left, right) => {
      const leftLeadMarket = getLeadMarket(left);
      const rightLeadMarket = getLeadMarket(right);

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

  const oddsService = await import("@/services/odds/board-service");
  const filters = oddsService.parseBoardFilters({
    league: selectedLeague,
    date: resolveBoardDate(selectedDate),
    sportsbook: "best",
    market: "all",
    status: "all"
  });

  const boardData = await oddsService.getBoardPageData(filters);

  const verifiedGames = boardData.games
    .filter(isVerifiedGame)
    .sort((left, right) => getLeadScore(right) - getLeadScore(left));

  const movers = buildMarketMovers(verifiedGames);
  const leagueSections = buildLeagueSections(boardData.sportSections);
  const scoreboardItems = buildScoreboardItems(leagueSections);

  return {
    selectedLeague,
    selectedDate,
    filters,
    boardData,
    verifiedGames,
    movers,
    leagueSections,
    scoreboardItems
  };
}
