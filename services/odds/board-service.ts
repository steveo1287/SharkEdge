import type {
  BoardFilters,
  BoardPageData,
  GameCardView,
  GameStatus,
  SportsbookRecord
} from "@/lib/types/domain";
import { boardFiltersSchema } from "@/lib/validation/filters";
import { buildProviderHealth } from "@/services/providers/provider-health";
import { withTimeoutFallback } from "@/lib/utils/async";
import { getBoardVisibleLeagues, buildBoardSportSections } from "@/services/events/live-score-service";
import { getBoardFeed } from "@/services/market-data/market-data-service";
import { overlayTheOddsApiSnapshot } from "@/services/odds/the-odds-api-board-overlay";

const LIVE_BOARD_TIMEOUT_MS = 15_000;

export function parseBoardFilters(searchParams: Record<string, string | string[] | undefined>) {
  return boardFiltersSchema.parse({
    league: Array.isArray(searchParams.league) ? searchParams.league[0] : searchParams.league,
    date: Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date,
    sportsbook: Array.isArray(searchParams.sportsbook)
      ? searchParams.sportsbook[0]
      : searchParams.sportsbook,
    market: Array.isArray(searchParams.market) ? searchParams.market[0] : searchParams.market,
    status: Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status
  }) satisfies BoardFilters;
}

// ... unchanged code omitted for brevity ...

export async function getBoardPageData(filters: BoardFilters): Promise<BoardPageData> {
  const dbData = await withTimeoutFallback(getDbBackedBoardPageData(filters), {
    timeoutMs: LIVE_BOARD_TIMEOUT_MS,
    fallback: null
  });

  if (dbData) {
    const overlaidGames = await overlayTheOddsApiSnapshot(dbData.games);
    dbData.games = overlaidGames;
    dbData.sportSections = dbData.sportSections.map((section) => ({
      ...section,
      games: overlaidGames.filter((g) => g.leagueKey === section.leagueKey)
    }));
  }

  if (dbData && hasRenderableOdds(dbData)) {
    return dbData;
  }

  if (dbData) {
    return dbData;
  }

  return getMockBoardPageData(filters);
}
