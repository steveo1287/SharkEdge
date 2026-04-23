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
import { getLiveBoardPageData } from "@/services/odds/live-board-data";

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
        ? "The live scoreboard mesh is still active, but the persisted current-odds inventory did not respond. SharkEdge is staying honest instead of rendering fake live board rows."
        : null,
    source: "mock",
    sourceNote:
      "Persisted live board inventory is unavailable right now, so the homepage is rendering support-aware scoreboard sections only. No synthetic provider rows are being passed off as live coverage.",
    providerHealth: buildProviderHealth({
      source: "mock",
      healthySummary: "Persisted live board inventory is connected.",
      fallbackSummary:
        "The board is leaning on scoreboard context because persisted live market inventory is unavailable.",
      offlineSummary:
        "Persisted live market inventory is offline in this runtime, so only support-aware scoreboard context is being shown."
    })
  };
}

type PersistedBoardFeed = {
  generatedAt: string;
  events: Array<{
    id: string;
    eventKey: string | null;
    league: string;
    name: string;
    startTime: string;
    status: string;
    participants: Array<{
      role: string;
      competitor: string;
    }>;
    markets: any[];
    topSignals: any[];
  }>;
};

function toGameStatus(value: string): GameStatus {
  switch (value) {
    case "PREGAME":
    case "LIVE":
    case "FINAL":
    case "POSTPONED":
    case "CANCELED":
      return value;
    default:
      return "PREGAME";
  }
}

async function getDbBackedBoardPageData(filters: BoardFilters): Promise<BoardPageData | null> {
  const leagueKey = filters.league === "ALL" ? undefined : filters.league;
  const board = (await getBoardFeed(leagueKey)) as PersistedBoardFeed;

  const grouped = new Map<string, any[]>();
  for (const event of board.events) {
    const list = grouped.get(event.league) ?? [];
    list.push(event);
    grouped.set(event.league, list);
  }

  const sportSections = await buildBoardSportSections({
    selectedLeague: filters.league,
    gamesByLeague: {}
  });

  const patchedSections = sportSections.map((section) => {
    const events = grouped.get(section.leagueKey) ?? [];

    const games: GameCardView[] = events.map((event) => {
      const participants = event.participants ?? [];
      const away = participants.find((p: any) => p.role === "AWAY")?.competitor ?? "Away";
      const home = participants.find((p: any) => p.role === "HOME")?.competitor ?? "Home";

      const moneylineState = (event.markets ?? []).find((m: any) => m.marketType === "moneyline");
      const spreadState = (event.markets ?? []).find((m: any) => m.marketType === "spread");
      const totalState = (event.markets ?? []).find((m: any) => m.marketType === "total");

      return {
        id: event.id,
        externalEventId: event.eventKey ?? event.id,
        leagueKey: section.leagueKey,
        awayTeam: {
          id: `away:${event.id}`,
          leagueId: section.leagueKey,
          name: away,
          abbreviation: away.slice(0, 3).toUpperCase(),
          externalIds: {}
        },
        homeTeam: {
          id: `home:${event.id}`,
          leagueId: section.leagueKey,
          name: home,
          abbreviation: home.slice(0, 3).toUpperCase(),
          externalIds: {}
        },
        startTime: event.startTime,
        status: toGameStatus(event.status),
        venue: "Live market state",
        selectedBook: null,
        bestBookCount: 1,
        moneyline: {
          label: "Moneyline",
          lineLabel: "Moneyline",
          bestBook: "Best available",
          bestOdds:
            moneylineState?.bestAwayOddsAmerican ??
            moneylineState?.bestHomeOddsAmerican ??
            0,
          movement: 0
        },
        spread: {
          label: "Spread",
          lineLabel:
            typeof spreadState?.consensusLineValue === "number"
              ? String(spreadState.consensusLineValue)
              : "—",
          bestBook: "Best available",
          bestOdds:
            spreadState?.bestAwayOddsAmerican ??
            spreadState?.bestHomeOddsAmerican ??
            0,
          movement: 0
        },
        total: {
          label: "Total",
          lineLabel:
            typeof totalState?.consensusLineValue === "number"
              ? `O/U ${totalState.consensusLineValue}`
              : "—",
          bestBook: "Best available",
          bestOdds:
            totalState?.bestOverOddsAmerican ??
            totalState?.bestUnderOddsAmerican ??
            0,
          movement: 0
        },
        edgeScore: {
          score: 0,
          label: "Pass"
        },
        detailHref: `/game/${event.id}`
      };
    });

    return {
      ...section,
      games
    };
  });

  const activeSections = patchedSections.filter(
    (section) => section.games.length > 0 || section.scoreboard.length > 0
  );

  return {
    filters,
    availableDates: [],
    leagues: getBoardVisibleLeagues(filters.league),
    sportsbooks: [{ id: "best", key: "best", name: "Best available", region: "US" }],
    games: activeSections.flatMap((section) => section.games) as GameCardView[],
    sportSections: patchedSections,
    snapshots: [],
    summary: {
      totalGames: activeSections.reduce((sum, section) => sum + section.games.length, 0),
      totalProps: 0,
      totalSportsbooks: 1
    },
    liveMessage: null,
    source: "live",
    sourceNote: "Board is rendering from persisted live market inventory.",
    providerHealth: buildProviderHealth({
      source: "live",
      healthySummary: "Board is rendering from persisted live market inventory.",
      degradedSummary: "Board inventory is partially available.",
      fallbackSummary: "Board is using persisted live market inventory fallback.",
      offlineSummary: "Persisted live market inventory is unavailable."
    })
  };
}

export async function getBoardPageData(filters: BoardFilters): Promise<BoardPageData> {
  const liveData = await withTimeoutFallback(getLiveBoardPageData(filters), {
    timeoutMs: LIVE_BOARD_TIMEOUT_MS,
    fallback: null
  });

  if (liveData) {
    return liveData;
  }

  const dbData = await withTimeoutFallback(getDbBackedBoardPageData(filters), {
    timeoutMs: LIVE_BOARD_TIMEOUT_MS,
    fallback: null
  });

  if (dbData) {
    return dbData;
  }

  return getMockBoardPageData(filters);
}
