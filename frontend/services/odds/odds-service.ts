import { calculateEdgeScore } from "@/lib/utils/edge-score";
import { calculateMarketExpectedValuePct } from "@/lib/utils/bet-intelligence";
import { formatAmericanOdds, formatLine } from "@/lib/formatters/odds";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { boardFiltersSchema, propsFiltersSchema } from "@/lib/validation/filters";
import type {
  BoardFilters,
  BoardMarketView,
  BoardPageData,
  GameCardView,
  GameDetailView,
  GameRecord,
  GameOddsRow,
  LeagueKey,
  PropCardView,
  PropFilters,
  SportsbookRecord
} from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";
import { getLeagueSnapshots, getTeamStatComparison } from "@/services/stats/stats-service";
import { buildBoardSportSections, getBoardVisibleLeagues } from "@/services/events/live-score-service";
import { getProviderRegistryEntry } from "@/services/providers/registry";
import {
  getLiveBoardPageData,
  getLiveGameDetail,
  getLivePropById,
  getLivePropsExplorerData
} from "@/services/odds/live-odds";

// TODO: Replace mockDatabase reads with bookmaker ingestion + Prisma-backed queries.

const leagueMap = new Map(mockDatabase.leagues.map((league) => [league.id, league]));
const teamMap = new Map(mockDatabase.teams.map((team) => [team.id, team]));
const playerMap = new Map(mockDatabase.players.map((player) => [player.id, player]));
const bookMap = new Map(mockDatabase.sportsbooks.map((book) => [book.id, book]));

function getGame(gameId: string) {
  return mockDatabase.games.find((game) => game.id === gameId) ?? null;
}

function getTeam(teamId: string) {
  return teamMap.get(teamId)!;
}

function getBook(bookId: string) {
  return bookMap.get(bookId)!;
}

function getMarketsForGame(gameId: string, marketType: string, playerId?: string | null) {
  return mockDatabase.markets.filter(
    (market) =>
      market.gameId === gameId &&
      market.marketType === marketType &&
      (playerId === undefined ? market.playerId === null : market.playerId === playerId)
  );
}

function getSnapshots(marketId: string) {
  return mockDatabase.marketSnapshots
    .filter((snapshot) => snapshot.marketId === marketId)
    .sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
}

function chooseBestRow(
  rows: typeof mockDatabase.markets,
  marketType: "spread" | "moneyline" | "total"
) {
  if (!rows.length) {
    return null;
  }

  if (marketType === "spread") {
    return [...rows].sort((left, right) => {
      const leftLine = left.line ?? 0;
      const rightLine = right.line ?? 0;
      if (leftLine !== rightLine) {
        return rightLine - leftLine;
      }

      return right.oddsAmerican - left.oddsAmerican;
    })[0];
  }

  if (marketType === "moneyline") {
    return [...rows].sort((left, right) => right.oddsAmerican - left.oddsAmerican)[0];
  }

  return [...rows].sort((left, right) => {
    if ((left.line ?? 0) !== (right.line ?? 0)) {
      return (left.line ?? 0) - (right.line ?? 0);
    }

    return right.oddsAmerican - left.oddsAmerican;
  })[0];
}

function getPrimarySide(game: GameRecord, marketType: "spread" | "moneyline" | "total") {
  const markets = getMarketsForGame(game.id, marketType);

  if (marketType === "total") {
    return "OVER";
  }

  if (marketType === "spread") {
    return (
      [...markets]
        .filter((market) => typeof market.line === "number")
        .sort((left, right) => (left.line ?? 0) - (right.line ?? 0))[0]?.side ?? game.homeTeamId
    );
  }

  return [...markets].sort((left, right) => left.oddsAmerican - right.oddsAmerican)[0]?.side ?? game.homeTeamId;
}

function buildMarketLabel(
  game: GameRecord,
  marketType: "spread" | "moneyline" | "total",
  row: (typeof mockDatabase.markets)[number]
) {
  if (marketType === "total") {
    return `O/U ${formatLine(row.line, false)}`;
  }

  const team = row.side === game.homeTeamId ? getTeam(game.homeTeamId) : getTeam(game.awayTeamId);
  const value = marketType === "moneyline" ? formatAmericanOdds(row.oddsAmerican) : formatLine(row.line);

  return `${team.abbreviation} ${value}`;
}

function buildBoardMarketView(
  game: GameRecord,
  marketType: "spread" | "moneyline" | "total",
  sportsbookKey: string
) {
  const primarySide = getPrimarySide(game, marketType);
  const candidates = getMarketsForGame(game.id, marketType).filter((market) =>
    marketType === "total" ? market.side === "OVER" : market.side === primarySide
  );

  const filtered =
    sportsbookKey === "best"
      ? candidates
      : candidates.filter((market) => getBook(market.sportsbookId).key === sportsbookKey);

  const row = chooseBestRow(filtered.length ? filtered : candidates, marketType);
  if (!row) {
    return {
      label: "No market",
      lineLabel: "No market",
      bestBook: "Unavailable",
      bestOdds: 0,
      movement: 0
    } satisfies BoardMarketView;
  }

  const firstSnapshot = getSnapshots(row.id)[0];
  const movement =
    marketType === "moneyline"
      ? row.oddsAmerican - (firstSnapshot?.oddsAmerican ?? row.oddsAmerican)
      : (row.line ?? 0) - (firstSnapshot?.line ?? row.line ?? 0);

  return {
    label: buildMarketLabel(game, marketType, row),
    lineLabel: buildMarketLabel(game, marketType, row),
    bestBook: getBook(row.sportsbookId).name,
    bestOdds: row.oddsAmerican,
    movement
  } satisfies BoardMarketView;
}

function getGameAngle(gameId: string) {
  return mockDatabase.gameAngles.find((entry) => entry.gameId === gameId);
}

function buildGameCard(game: GameRecord, sportsbookKey: string) {
  const angle = getGameAngle(game.id);
  const homeTeam = getTeam(game.homeTeamId);
  const awayTeam = getTeam(game.awayTeamId);

  return {
    id: game.id,
    leagueKey: leagueMap.get(game.leagueId)!.key,
    awayTeam,
    homeTeam,
    startTime: game.startTime,
    status: game.status,
    venue: game.venue,
    selectedBook:
      sportsbookKey === "best"
        ? null
        : mockDatabase.sportsbooks.find((book) => book.key === sportsbookKey) ?? null,
    bestBookCount: new Set(
      getMarketsForGame(game.id, "spread").map((market) => market.sportsbookId)
    ).size,
    spread: buildBoardMarketView(game, "spread", sportsbookKey),
    moneyline: buildBoardMarketView(game, "moneyline", sportsbookKey),
    total: buildBoardMarketView(game, "total", sportsbookKey),
    edgeScore: calculateEdgeScore({
      impliedProbability: getMarketsForGame(game.id, "moneyline")
        .sort((left, right) => left.oddsAmerican - right.oddsAmerican)[0]?.impliedProbability,
      modelProbability: angle?.modelProbability,
      recentHitRate: angle?.recentHitRate,
      matchupRank: angle?.matchupRank,
      lineMovementSupport: angle?.lineMovementSupport,
      volatility: angle?.volatility
    }),
    detailHref: buildMatchupHref(leagueMap.get(game.leagueId)!.key, game.id)
  } satisfies GameCardView;
}

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
  const sportSections = await buildBoardSportSections({
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
    leagues: getBoardVisibleLeagues(filters.league),
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
      "Current odds are unavailable right now, so the homepage is rendering support-aware scoreboard sections only. No seeded game rows are being passed off as live coverage."
  };
}

export async function getBoardPageData(filters: BoardFilters): Promise<BoardPageData> {
  const liveData = await getLiveBoardPageData(filters);
  if (liveData) {
    return liveData;
  }

  return getMockBoardPageData(filters);
}

function buildOddsRow(game: GameRecord, sportsbook: SportsbookRecord) {
  const spreadRows = getMarketsForGame(game.id, "spread").filter(
    (market) => market.sportsbookId === sportsbook.id
  );
  const moneylineRows = getMarketsForGame(game.id, "moneyline").filter(
    (market) => market.sportsbookId === sportsbook.id
  );
  const totalRows = getMarketsForGame(game.id, "total").filter(
    (market) => market.sportsbookId === sportsbook.id
  );

  const homeSpread = spreadRows.find((market) => market.side === game.homeTeamId);
  const awaySpread = spreadRows.find((market) => market.side === game.awayTeamId);
  const homeMoneyline = moneylineRows.find((market) => market.side === game.homeTeamId);
  const awayMoneyline = moneylineRows.find((market) => market.side === game.awayTeamId);
  const over = totalRows.find((market) => market.side === "OVER");
  const under = totalRows.find((market) => market.side === "UNDER");
  const formatOdds = (odds: number | undefined) =>
    typeof odds === "number" ? formatAmericanOdds(odds) : "--";

  return {
    sportsbook,
    spread: `${getTeam(game.awayTeamId).abbreviation} ${formatLine(awaySpread?.line ?? null)} (${formatOdds(awaySpread?.oddsAmerican)}) | ${getTeam(game.homeTeamId).abbreviation} ${formatLine(homeSpread?.line ?? null)} (${formatOdds(homeSpread?.oddsAmerican)})`,
    moneyline: `${getTeam(game.awayTeamId).abbreviation} ${formatOdds(awayMoneyline?.oddsAmerican)} | ${getTeam(game.homeTeamId).abbreviation} ${formatOdds(homeMoneyline?.oddsAmerican)}`,
    total: `O ${formatLine(over?.line ?? null, false)} (${formatOdds(over?.oddsAmerican)}) | U ${formatLine(under?.line ?? null, false)} (${formatOdds(under?.oddsAmerican)})`
  } satisfies GameOddsRow;
}

function buildPropCard(angleId: string): PropCardView | null {
  const angle = mockDatabase.propAngles.find((entry) => entry.id === angleId);
  if (!angle) {
    return null;
  }

  const game = getGame(angle.gameId);
  if (!game) {
    return null;
  }

  const player = playerMap.get(angle.playerId)!;
  const team = getTeam(player.teamId);
  const opponent = team.id === game.homeTeamId ? getTeam(game.awayTeamId) : getTeam(game.homeTeamId);
  const preferredBook = getBook(angle.preferredSportsbookId);
  const market = mockDatabase.markets.find(
    (entry) =>
      entry.gameId === angle.gameId &&
      entry.playerId === angle.playerId &&
      entry.marketType === angle.marketType &&
      entry.sportsbookId === angle.preferredSportsbookId &&
      entry.side === angle.preferredSide
  );
  if (!market) {
    return null;
  }

  const snapshots = getSnapshots(market.id);
  const lineMovement = (market.line ?? 0) - (snapshots[0]?.line ?? market.line ?? 0);
  const propMarketType = angle.marketType as PropCardView["marketType"];
  const priceDelta =
    market.oddsAmerican - Math.round(
      getMarketsForGame(game.id, angle.marketType, angle.playerId).reduce(
        (total, row) => total + row.oddsAmerican,
        0
      ) / Math.max(1, getMarketsForGame(game.id, angle.marketType, angle.playerId).length)
    );

  return {
    id: angle.id,
    gameId: game.id,
    leagueKey: leagueMap.get(game.leagueId)!.key,
    sportsbook: preferredBook,
    player,
    team,
    opponent,
    marketType: propMarketType,
    side: angle.preferredSide,
    line: market.line ?? 0,
    oddsAmerican: market.oddsAmerican,
    recentHitRate: angle.recentHitRate,
    matchupRank: angle.matchupRank,
    edgeScore: calculateEdgeScore({
      impliedProbability: market.impliedProbability,
      modelProbability: angle.modelProbability,
      recentHitRate: angle.recentHitRate,
      matchupRank: angle.matchupRank,
      lineMovementSupport: lineMovement,
      volatility: angle.volatility
    }),
    sportsbookCount: new Set(
      getMarketsForGame(game.id, angle.marketType, angle.playerId).map((row) => row.sportsbookId)
    ).size,
    bestAvailableOddsAmerican: market.oddsAmerican,
    bestAvailableSportsbookName: preferredBook.name,
    averageOddsAmerican: Math.round(
      getMarketsForGame(game.id, angle.marketType, angle.playerId).reduce(
        (total, row) => total + row.oddsAmerican,
        0
      ) / Math.max(1, getMarketsForGame(game.id, angle.marketType, angle.playerId).length)
    ),
    marketDeltaAmerican: priceDelta,
    expectedValuePct: calculateMarketExpectedValuePct(
      market.oddsAmerican,
      Math.round(
        getMarketsForGame(game.id, angle.marketType, angle.playerId).reduce(
          (total, row) => total + row.oddsAmerican,
          0
        ) / Math.max(1, getMarketsForGame(game.id, angle.marketType, angle.playerId).length)
      )
    ),
    lineMovement,
    valueFlag: priceDelta >= 10 ? "MARKET_PLUS" : "BEST_PRICE",
    supportStatus: "LIVE",
    supportNote: "Showing seeded prop history because the live props backend is unavailable in this runtime.",
    gameHref: buildMatchupHref(leagueMap.get(game.leagueId)!.key, game.id),
    source: "mock"
  } satisfies PropCardView;
}

export function parsePropsFilters(searchParams: Record<string, string | string[] | undefined>) {
  return propsFiltersSchema.parse({
    league: Array.isArray(searchParams.league) ? searchParams.league[0] : searchParams.league,
    marketType: Array.isArray(searchParams.marketType)
      ? searchParams.marketType[0]
      : searchParams.marketType,
    team: Array.isArray(searchParams.team) ? searchParams.team[0] : searchParams.team,
    player: Array.isArray(searchParams.player) ? searchParams.player[0] : searchParams.player,
    sportsbook: Array.isArray(searchParams.sportsbook)
      ? searchParams.sportsbook[0]
      : searchParams.sportsbook,
    valueFlag: Array.isArray(searchParams.valueFlag)
      ? searchParams.valueFlag[0]
      : searchParams.valueFlag,
    sortBy: Array.isArray(searchParams.sortBy) ? searchParams.sortBy[0] : searchParams.sortBy
  }) satisfies PropFilters;
}

function getMockPropsExplorerData(filters: PropFilters) {
  const coverage = [
    "NBA",
    "NCAAB",
    "MLB",
    "NHL",
    "NFL",
    "NCAAF",
    "UFC",
    "BOXING"
  ].map((leagueKey) => {
    const registry = getProviderRegistryEntry(leagueKey as LeagueKey);

    return {
      leagueKey,
      status: registry.propsStatus,
      providers: registry.propsProviders,
      supportedMarkets: registry.supportedPropMarkets,
      note: registry.propsNote
    };
  });

  return {
    filters,
    props: [],
    coverage,
    leagues: mockDatabase.leagues,
    sportsbooks: mockDatabase.sportsbooks,
    teams: mockDatabase.teams,
    players: mockDatabase.players,
    source: "catalog" as const,
    sourceNote:
      "Live props are not available from the current backend right now. SharkEdge keeps every sport visible with honest provider states instead of backfilling fake prop rows."
  };
}

export async function getPropsExplorerData(filters: PropFilters) {
  const liveData = await getLivePropsExplorerData(filters);
  return liveData ?? getMockPropsExplorerData(filters);
}

export async function getTopPlayCards(limit = 3) {
  const data = await getPropsExplorerData({
    league: "ALL",
    marketType: "ALL",
    team: "all",
    player: "all",
    sportsbook: "all",
    valueFlag: "all",
    sortBy: "best_price"
  });

  return data.props
    .filter(
      (prop) =>
        prop.source === "live" &&
        typeof prop.expectedValuePct === "number" &&
        prop.expectedValuePct > 0
    )
    .sort((left, right) => {
      const evDelta = (right.expectedValuePct ?? -999) - (left.expectedValuePct ?? -999);
      if (evDelta !== 0) {
        return evDelta;
      }

      return right.edgeScore.score - left.edgeScore.score;
    })
    .slice(0, limit);
}

export async function getPropById(propId: string): Promise<PropCardView | null> {
  const liveProp = await getLivePropById(propId);
  if (liveProp) {
    return liveProp;
  }

  return buildPropCard(propId);
}

function getMockGameDetail(id: string): GameDetailView | null {
  const game = getGame(id);
  if (!game) {
    return null;
  }

  const angle = getGameAngle(game.id);
  const injuries = mockDatabase.injuries
    .filter((entry) => entry.gameId === game.id)
    .map((entry) => ({
      id: entry.id,
      playerName: entry.playerId ? playerMap.get(entry.playerId)?.name ?? null : null,
      teamName: entry.teamId ? teamMap.get(entry.teamId)?.name ?? null : null,
      status: entry.status,
      source: entry.source,
      reportedAt: entry.reportedAt
    }));
  const books = mockDatabase.sportsbooks.map((book) => buildOddsRow(game, book));
  const props = mockDatabase.propAngles
    .filter((entry) => entry.gameId === game.id)
    .map((entry) => buildPropCard(entry.id))
    .filter(Boolean) as PropCardView[];
  const matchup =
    getTeamStatComparison(game.id) ??
    {
      away: {
        team: getTeam(game.awayTeamId),
        stats: {
          pace: "--",
          offensiveRating: "--",
          defensiveRating: "--",
          recentForm: "No sample yet",
          split: "Away split pending",
          atsLast10: "--"
        }
      },
      home: {
        team: getTeam(game.homeTeamId),
        stats: {
          pace: "--",
          offensiveRating: "--",
          defensiveRating: "--",
          recentForm: "No sample yet",
          split: "Home split pending",
          atsLast10: "--"
        }
      }
    };
  const dkSpread = mockDatabase.markets.find(
    (entry) =>
      entry.gameId === game.id &&
      entry.marketType === "spread" &&
      entry.sportsbookId === "book_dk" &&
      entry.side === game.homeTeamId
  );
  const dkTotal = mockDatabase.markets.find(
    (entry) =>
      entry.gameId === game.id &&
      entry.marketType === "total" &&
      entry.sportsbookId === "book_dk" &&
      entry.side === "OVER"
  );
  const lineMovement = (dkSpread ? getSnapshots(dkSpread.id) : []).map((snapshot, index) => ({
    capturedAt: snapshot.capturedAt,
    spreadLine: snapshot.line,
    totalLine: dkTotal ? getSnapshots(dkTotal.id)[index]?.line ?? dkTotal.line : null
  }));

  return {
    game,
    league: leagueMap.get(game.leagueId)!,
    awayTeam: getTeam(game.awayTeamId),
    homeTeam: getTeam(game.homeTeamId),
    books,
    bestMarkets: {
      spread: buildBoardMarketView(game, "spread", "best"),
      moneyline: buildBoardMarketView(game, "moneyline", "best"),
      total: buildBoardMarketView(game, "total", "best")
    },
    edgeScore: calculateEdgeScore({
      impliedProbability: getMarketsForGame(game.id, "moneyline")
        .sort((left, right) => left.oddsAmerican - right.oddsAmerican)[0]?.impliedProbability,
      modelProbability: angle?.modelProbability,
      recentHitRate: angle?.recentHitRate,
      matchupRank: angle?.matchupRank,
      lineMovementSupport: angle?.lineMovementSupport,
      volatility: angle?.volatility
    }),
    consensus: `${buildBoardMarketView(game, "spread", "best").label} | ${buildBoardMarketView(game, "total", "best").label}`,
    insights: [
      `${getTeam(game.homeTeamId).name} carry the stronger home split into this matchup.`,
      `${getTeam(game.awayTeamId).name} bring ${((matchup?.away.stats.recentForm as string) ?? "steady form")} over the last ten.`,
      "Edge score is still a placeholder composite, but the card is structured for model-grade replacement."
    ],
    injuries,
    props,
    matchup,
    lineMovement,
    marketRanges: [],
    propsNotice: undefined,
    source: "mock"
  } satisfies GameDetailView;
}

export async function getGameDetail(id: string) {
  const liveDetail = await getLiveGameDetail(id);
  if (liveDetail) {
    return liveDetail;
  }

  return getMockGameDetail(id);
}
