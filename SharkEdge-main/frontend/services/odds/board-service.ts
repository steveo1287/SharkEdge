import type { BoardFilters, BoardPageData, SportsbookRecord } from "@/lib/types/domain";
import { boardFiltersSchema } from "@/lib/validation/filters";
import { buildProviderHealth } from "@/services/providers/provider-health";
import { withTimeoutFallback } from "@/lib/utils/async";

// League-scoped odds fetch is cached, but allow a slightly longer first-hit window on cold lambdas.
const LIVE_BOARD_TIMEOUT_MS = 6_500;

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

async function getMockBoardPageData(filters: BoardFilters): Promise<BoardPageData> {
  const [{ mockDatabase }, liveScoreService] = await Promise.all([
    import("@/prisma/seed-data"),
    import("@/services/events/live-score-service")
  ]);

  const sportSections = await liveScoreService.buildBoardSportSections({
    selectedLeague: filters.league,
    gamesByLeague: {}
  });

  return {
    filters,
    availableDates: Array.from(
      new Set(
        sportSections.flatMap((section) =>
          section.scoreboard.map((event) => event.startTime.slice(0, 10))
        )
      )
    ).sort(),
    leagues: liveScoreService.getBoardVisibleLeagues(filters.league),
    sportsbooks: [
      { id: "best", key: "best", name: "Best available", region: "US" } satisfies SportsbookRecord,
      ...mockDatabase.sportsbooks
    ],
    games: [],
    sportSections,
    snapshots: [],
    summary: {
      totalGames: sportSections.reduce(
        (total, section) => total + section.games.length + section.scoreboard.length,
        0
      ),
      totalProps: 0,
      totalSportsbooks: mockDatabase.sportsbooks.length
    },
    liveMessage:
      filters.status === "live"
        ? "The live scoreboard mesh is still active, but the current-odds backend did not respond. SharkEdge is staying honest instead of rendering seeded board rows."
        : null,
    source: "mock",
    sourceNote:
      "Current odds are unavailable right now, so the homepage is rendering support-aware scoreboard sections only. No seeded game rows are being passed off as live coverage.",
    providerHealth: buildProviderHealth({
      source: "mock",
      healthySummary: "Live board pricing is connected.",
      fallbackSummary:
        "The board is leaning on scoreboard context because the live current-odds adapter is not responding.",
      offlineSummary:
        "The live current-odds adapter is offline in this runtime, so only support-aware scoreboard context is being shown."
    })
  };
}

export async function getBoardPageData(filters: BoardFilters): Promise<BoardPageData> {
  const liveData = await withTimeoutFallback(
    import("@/services/odds/live-board-data").then((module) => module.getLiveBoardPageData(filters)),
    {
      timeoutMs: LIVE_BOARD_TIMEOUT_MS,
      fallback: null
    }
  );
  if (liveData) {
    return liveData;
  }

  return getMockBoardPageData(filters);
}
