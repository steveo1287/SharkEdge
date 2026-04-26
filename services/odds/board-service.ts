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
    case "SCHEDULED":
      return "PREGAME";
    case "LIVE":
    case "FINAL":
    case "POSTPONED":
    case "CANCELED":
      return value;
    default:
      return "PREGAME";
  }
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function usableOdds(value: unknown) {
  const numeric = numericValue(value);
  return numeric !== null && numeric !== 0 ? numeric : null;
}

function marketTypeOf(market: any) {
  return String(market?.marketType ?? "").toLowerCase();
}

function marketsByType(markets: any[], marketType: "moneyline" | "spread" | "total") {
  return (markets ?? []).filter((market) => marketTypeOf(market) === marketType);
}

function bestNumeric(values: unknown[]) {
  const numbers = values.map(usableOdds).filter((value): value is number => value !== null);
  if (!numbers.length) return 0;
  return numbers.sort((left, right) => right - left)[0] ?? 0;
}

function getBestMarketOdds(markets: any[], marketType: "moneyline" | "spread" | "total") {
  const typed = marketsByType(markets, marketType);
  if (!typed.length) return 0;

  if (marketType === "moneyline") {
    return bestNumeric(
      typed.flatMap((market) => [
        market.bestAwayOddsAmerican,
        market.bestHomeOddsAmerican,
        market.bestOddsAmerican,
        market.currentOdds,
        market.oddsAmerican
      ])
    );
  }

  if (marketType === "spread") {
    return bestNumeric(
      typed.flatMap((market) => [
        market.bestAwayOddsAmerican,
        market.bestHomeOddsAmerican,
        market.bestOddsAmerican,
        market.currentOdds,
        market.oddsAmerican
      ])
    );
  }

  return bestNumeric(
    typed.flatMap((market) => [
      market.bestOverOddsAmerican,
      market.bestUnderOddsAmerican,
      market.bestOddsAmerican,
      market.currentOdds,
      market.oddsAmerican
    ])
  );
}

function getConsensusLine(markets: any[], marketType: "spread" | "total") {
  const typed = marketsByType(markets, marketType);
  for (const market of typed) {
    const line = numericValue(market.consensusLineValue) ?? numericValue(market.currentLine) ?? numericValue(market.line);
    if (line !== null) return line;
  }
  return null;
}

function getBookCount(markets: any[]) {
  const books = new Set<string>();
  for (const market of markets ?? []) {
    const key =
      market?.sportsbook?.key ??
      market?.sportsbook?.name ??
      market?.sportsbookId ??
      market?.bestHomeBook?.key ??
      market?.bestAwayBook?.key ??
      market?.bestOverBook?.key ??
      market?.bestUnderBook?.key;
    if (key) books.add(String(key));
  }
  return Math.max(books.size, markets.length ? 1 : 0);
}

function getParticipantNames(event: PersistedBoardFeed["events"][number]) {
  const participants = event.participants ?? [];
  const away = participants.find((p: any) => p.role === "AWAY")?.competitor;
  const home = participants.find((p: any) => p.role === "HOME")?.competitor;
  if (away && home) {
    return { away, home };
  }

  const [nameAway, nameHome] = String(event.name ?? "").split(" @ ");
  return {
    away: away ?? nameAway ?? "Away",
    home: home ?? nameHome ?? "Home"
  };
}

function hasRenderableOdds(data: BoardPageData | null) {
  if (!data) return false;
  return data.sportSections.some((section) =>
    section.games.some(
      (game) =>
        game.moneyline.bestOdds != null ||
        game.spread.bestOdds != null ||
        game.total.bestOdds != null
    )
  );
}

async function getDbBackedBoardPageData(filters: BoardFilters): Promise<BoardPageData | null> {
  const leagueKey = filters.league === "ALL" ? undefined : filters.league;
  const board = (await getBoardFeed(leagueKey, { skipCache: true })) as PersistedBoardFeed;

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
      const { away, home } = getParticipantNames(event);
      const moneylineOdds = getBestMarketOdds(event.markets, "moneyline");
      const spreadOdds = getBestMarketOdds(event.markets, "spread");
      const totalOdds = getBestMarketOdds(event.markets, "total");
      const spreadLine = getConsensusLine(event.markets, "spread");
      const totalLine = getConsensusLine(event.markets, "total");

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
        venue: "OddsHarvester market state",
        selectedBook: null,
        bestBookCount: getBookCount(event.markets),
        moneyline: {
          label: "Moneyline",
          lineLabel: "Moneyline",
          bestBook: "Best available",
          bestOdds: moneylineOdds,
          movement: 0
        },
        spread: {
          label: "Spread",
          lineLabel: typeof spreadLine === "number" ? String(spreadLine) : "—",
          bestBook: "Best available",
          bestOdds: spreadOdds,
          movement: 0
        },
        total: {
          label: "Total",
          lineLabel: typeof totalLine === "number" ? `O/U ${totalLine}` : "—",
          bestBook: "Best available",
          bestOdds: totalOdds,
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
    sourceNote: "Board is rendering from OddsHarvester-ingested market inventory.",
    providerHealth: buildProviderHealth({
      source: "live",
      healthySummary: "Board is rendering from OddsHarvester-ingested market inventory.",
      degradedSummary: "Board inventory is partially available.",
      fallbackSummary: "Board is using persisted live market inventory fallback.",
      offlineSummary: "Persisted live market inventory is unavailable."
    })
  };
}

export async function getBoardPageData(filters: BoardFilters): Promise<BoardPageData> {
  const dbData = await withTimeoutFallback(getDbBackedBoardPageData(filters), {
    timeoutMs: LIVE_BOARD_TIMEOUT_MS,
    fallback: null
  });

  if (dbData && hasRenderableOdds(dbData)) {
    return dbData;
  }

  // DB returned data but no renderable odds — still prefer it over mock so real
  // scoreboard context is shown rather than a completely empty page.
  if (dbData) {
    return dbData;
  }

  return getMockBoardPageData(filters);
}
