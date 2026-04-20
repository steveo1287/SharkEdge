import { calculateEdgeScore } from "@/lib/utils/edge-score";
import { withTimeoutFallback } from "@/lib/utils/async";
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
  PlayerRecord,
  PropCardView,
  PropFilters,
  SportsbookRecord,
  TeamRecord
} from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";
import { getLeagueSnapshots, getTeamStatComparison } from "@/services/stats/stats-service";
import { buildBoardSportSections, getBoardVisibleLeagues } from "@/services/events/live-score-service";
import { buildProviderHealth } from "@/services/providers/provider-health";
import { getProviderRegistryEntry } from "@/services/providers/registry";
import { buildMarketTruth, type MarketPriceSample } from "@/services/market/market-truth-service";
import { buildReasonAttribution } from "@/services/market/reason-attribution-service";
import { analyzeMarket } from "@/services/market/market-analysis-service";
import {
  getStoredPropById,
  getStoredPropsExplorerData,
  getStoredPropsForEvent
} from "@/services/props/warehouse-service";
import { getPropTrendSummaries } from "@/services/trends/trends-service";
import { getLiveBoardPageData } from "@/services/odds/live-board-data";
import {
  getLiveGameDetail,
  getLivePropById,
  getLivePropsExplorerData
} from "@/services/odds/live-odds";

// TODO: Replace mockDatabase reads with bookmaker ingestion + Prisma-backed queries.

const LIVE_BOARD_TIMEOUT_MS = 3_500;
const LIVE_PROPS_TIMEOUT_MS = 3_500;
const STORED_PROPS_TIMEOUT_MS = 2_500;
const LIVE_GAME_DETAIL_TIMEOUT_MS = 3_500;
const STORED_GAME_PROPS_TIMEOUT_MS = 2_500;

const leagueMap = new Map(mockDatabase.leagues.map((league) => [league.id, league]));
const teamMap = new Map(mockDatabase.teams.map((team) => [team.id, team]));
const playerMap = new Map(mockDatabase.players.map((player) => [player.id, player]));
const bookMap = new Map(mockDatabase.sportsbooks.map((book) => [book.id, book]));

function buildEmptyStoredPropsResult(sourceNote: string) {
  return {
    props: [] as PropCardView[],
    sportsbooks: [] as SportsbookRecord[],
    teams: [] as TeamRecord[],
    players: [] as PlayerRecord[],
    sourceNote
  };
}

function buildUnavailableMarketView(): BoardMarketView {
  const marketTruth = buildMarketTruth({
    marketLabel: "Market",
    offeredOddsAmerican: null,
    sideSamples: [],
    oppositeSamples: []
  });
  const attribution = buildReasonAttribution({
    marketLabel: "Market",
    marketTruth,
    supportNote: "No verified market samples are available."
  });

  return {
    label: "No market",
    lineLabel: "No market",
    bestBook: "Unavailable",
    bestOdds: 0,
    movement: 0,
    marketTruth,
    reasons: attribution.reasons,
    confidenceBand: attribution.confidenceBand,
    confidenceScore: attribution.confidenceScore,
    hidden: attribution.suppress
  } satisfies BoardMarketView;
}

function buildMockMarketSamples(
  gameId: string,
  marketType: "spread" | "moneyline" | "total",
  side: string
) {
  return getMarketsForGame(gameId, marketType)
    .filter((market) => market.side === side && typeof market.oddsAmerican === "number")
    .map((market) => ({
      bookKey: getBook(market.sportsbookId).key,
      bookName: getBook(market.sportsbookId).name,
      price: market.oddsAmerican,
      line: market.line ?? null,
      updatedAt: market.updatedAt ?? null,
      history: getSnapshots(market.id).map((snapshot) => ({
        capturedAt: snapshot.capturedAt,
        price: snapshot.oddsAmerican,
        line: snapshot.line ?? null
      }))
    })) satisfies MarketPriceSample[];
}

function getOppositeMarketSide(
  game: GameRecord,
  marketType: "spread" | "moneyline" | "total",
  primarySide: string
) {
  if (marketType === "total") {
    return primarySide === "OVER" ? "UNDER" : "OVER";
  }

  return primarySide === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
}

function buildMockMarketView(
  game: GameRecord,
  marketType: "spread" | "moneyline" | "total",
  sportsbookKey: string
) {
  const primarySide = getPrimarySide(game, marketType);
  const oppositeSide = getOppositeMarketSide(game, marketType, primarySide);
  const candidates = getMarketsForGame(game.id, marketType).filter((market) =>
    marketType === "total" ? market.side === "OVER" : market.side === primarySide
  );
  const oppositeCandidates = getMarketsForGame(game.id, marketType).filter((market) =>
    market.side === oppositeSide
  );

  const filtered =
    sportsbookKey === "best"
      ? candidates
      : candidates.filter((market) => getBook(market.sportsbookId).key === sportsbookKey);

  const row = chooseBestRow(filtered.length ? filtered : candidates, marketType);
  if (!row) {
    return buildUnavailableMarketView();
  }

  const firstSnapshot = getSnapshots(row.id)[0];
  const movement =
    marketType === "moneyline"
      ? row.oddsAmerican - (firstSnapshot?.oddsAmerican ?? row.oddsAmerican)
      : (row.line ?? 0) - (firstSnapshot?.line ?? row.line ?? 0);
  const sideSamples = buildMockMarketSamples(game.id, marketType, primarySide);
  const oppositeSamples = buildMockMarketSamples(game.id, marketType, oppositeSide);
  const marketLabel =
    marketType === "spread" ? "Spread" : marketType === "moneyline" ? "Moneyline" : "Total";
  const analysis = analyzeMarket({
    marketLabel,
    sport: leagueMap.get(game.leagueId)!.sport,
    league: leagueMap.get(game.leagueId)!.key,
    eventId: game.id,
    providerEventId: game.externalEventId,
    marketType,
    marketScope: "game",
    side: primarySide,
    oppositeSide,
    line: row.line ?? null,
    participantTeamId: marketType === "total" ? null : primarySide,
    offeredSportsbookKey: getBook(row.sportsbookId).key,
    offeredOddsAmerican: row.oddsAmerican,
    sideSamples,
    oppositeSamples,
    lineMovement: movement,
    supportNote: "Current odds backend",
    sourceName: "Seeded market snapshots",
    sourceType: "mock",
    isLive: false
  });

  return {
    label: buildMarketLabel(game, marketType, row),
    lineLabel: buildMarketLabel(game, marketType, row),
    bestBook: getBook(row.sportsbookId).name,
    bestOdds: row.oddsAmerican,
    movement,
    canonicalMarketKey: analysis.canonicalMarketKey,
    marketTruth: analysis.marketTruth,
    fairPrice: analysis.fairPrice,
    evProfile: analysis.ev,
    marketIntelligence: analysis.marketIntelligence,
    marketPath: analysis.marketPath,
    reasons: analysis.reasons,
    confidenceBand: analysis.confidenceBand,
    confidenceScore: analysis.confidenceScore,
    hidden: analysis.hidden
  } satisfies BoardMarketView;
}

function getPropMergeKey(prop: PropCardView) {
  return [
    prop.leagueKey,
    prop.gameId,
    prop.player.name.toLowerCase(),
    prop.marketType,
    prop.side.toLowerCase(),
    String(prop.line)
  ].join(":");
}

function mergePropCatalogs(primary: PropCardView[], secondary: PropCardView[]) {
  const secondaryByKey = new Map(secondary.map((prop) => [getPropMergeKey(prop), prop] as const));

  const mergedPrimary = primary.map((prop) => {
    const stored = secondaryByKey.get(getPropMergeKey(prop));
    if (!stored) {
      return prop;
    }

    const supportNote = [prop.supportNote, stored.analyticsSummary?.reason]
      .filter(Boolean)
      .join(" ");

    return {
      ...stored,
      ...prop,
      supportNote: supportNote || prop.supportNote || stored.supportNote,
      analyticsSummary: stored.analyticsSummary ?? prop.analyticsSummary ?? null,
      trendSummary: prop.trendSummary ?? stored.trendSummary ?? null
    } satisfies PropCardView;
  });

  const merged = new Map(mergedPrimary.map((prop) => [getPropMergeKey(prop), prop] as const));
  for (const prop of secondary) {
    const key = getPropMergeKey(prop);
    if (!merged.has(key)) {
      merged.set(key, prop);
    }
  }

  return Array.from(merged.values());
}

async function attachPropTrendSummaries(props: PropCardView[]) {
  if (!props.length) {
    return props;
  }

  const summaries = await getPropTrendSummaries(props);
  return props.map((prop) => ({
    ...prop,
    trendSummary: prop.trendSummary ?? summaries[prop.id] ?? null
  }));
}

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
    externalEventId: game.id,
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
  const liveData = await withTimeoutFallback(getLiveBoardPageData(filters), {
    timeoutMs: LIVE_BOARD_TIMEOUT_MS,
    fallback: null
  });
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
  const sideMarketRows = getMarketsForGame(game.id, angle.marketType, angle.playerId).filter(
    (row) => row.side === angle.preferredSide && row.line === market.line
  );
  const oppositeMarketRows = getMarketsForGame(game.id, angle.marketType, angle.playerId).filter(
    (row) => row.side !== angle.preferredSide && row.line === market.line
  );
  const sideSamples = sideMarketRows.map((row) => ({
    bookKey: getBook(row.sportsbookId).key,
    bookName: getBook(row.sportsbookId).name,
    price: row.oddsAmerican,
    line: row.line ?? null,
    updatedAt: row.updatedAt ?? null,
    history: getSnapshots(row.id).map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      price: snapshot.oddsAmerican,
      line: snapshot.line ?? null
    }))
  })) satisfies MarketPriceSample[];
  const oppositeSamples = oppositeMarketRows.map((row) => ({
    bookKey: getBook(row.sportsbookId).key,
    bookName: getBook(row.sportsbookId).name,
    price: row.oddsAmerican,
    line: row.line ?? null,
    updatedAt: row.updatedAt ?? null,
    history: getSnapshots(row.id).map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      price: snapshot.oddsAmerican,
      line: snapshot.line ?? null
    }))
  })) satisfies MarketPriceSample[];
  const priceDelta =
    market.oddsAmerican - Math.round(
      getMarketsForGame(game.id, angle.marketType, angle.playerId).reduce(
        (total, row) => total + row.oddsAmerican,
        0
      ) / Math.max(1, getMarketsForGame(game.id, angle.marketType, angle.playerId).length)
    );
  const analysis = analyzeMarket({
    marketLabel: angle.marketType.replace(/_/g, " "),
    sport: leagueMap.get(game.leagueId)!.sport,
    league: leagueMap.get(game.leagueId)!.key,
    eventId: game.id,
    providerEventId: game.externalEventId,
    marketType: propMarketType,
    marketScope: "player",
    side: angle.preferredSide,
    oppositeSide: oppositeMarketRows[0]?.side ?? null,
    line: market.line ?? 0,
    participantTeamId: team.id,
    participantPlayerId: player.id,
    offeredSportsbookKey: preferredBook.key,
    offeredOddsAmerican: market.oddsAmerican,
    sideSamples,
    oppositeSamples,
    lineMovement,
    supportNote: "Showing seeded prop history because the live props backend is unavailable in this runtime.",
    sourceName: "Seeded prop snapshots",
    sourceType: "mock",
    isLive: false
  });

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
    expectedValuePct: analysis.expectedValuePct,
    lineMovement,
    valueFlag:
      priceDelta >= 10 ? "MARKET_PLUS" : analysis.bestPriceFlag ? "BEST_PRICE" : "NONE",
    supportStatus: "LIVE",
    supportNote: "Showing seeded prop history because the live props backend is unavailable in this runtime.",
    gameHref: buildMatchupHref(leagueMap.get(game.leagueId)!.key, game.id),
    canonicalMarketKey: analysis.canonicalMarketKey,
    analyticsSummary: {
      tags: [
        `method:${analysis.fairPrice?.pricingMethod ?? "unavailable"}`,
        `confidence:${analysis.fairPrice?.pricingConfidenceScore ?? 0}`
      ],
      reason: analysis.fairPrice?.coverageNote ?? "Fair price is waiting on usable two-way market depth.",
      sampleSize: null,
      bookCount: analysis.marketIntelligence?.sourceCount ?? sideSamples.length,
      lineMovement: lineMovement ?? null
    },
    marketTruth: analysis.marketTruth,
    fairPrice: analysis.fairPrice,
    evProfile: analysis.ev,
    marketIntelligence: analysis.marketIntelligence,
    marketPath: analysis.marketPath,
    reasons: analysis.reasons,
    confidenceBand: analysis.confidenceBand,
    confidenceScore: analysis.confidenceScore,
    hidden: analysis.hidden,
    source: "mock"
  } satisfies PropCardView;
}

function sortPropCards(props: PropCardView[], filters: PropFilters) {
  return [...props].sort((left, right) => {
    if (filters.sortBy === "league" && left.leagueKey !== right.leagueKey) {
      return left.leagueKey.localeCompare(right.leagueKey);
    }

    if (filters.sortBy === "start_time" && left.gameId !== right.gameId) {
      return left.gameId.localeCompare(right.gameId);
    }

    if (filters.sortBy === "line_movement") {
      return Math.abs(right.lineMovement ?? -1) - Math.abs(left.lineMovement ?? -1);
    }

    if (filters.sortBy === "market_ev") {
      return (right.expectedValuePct ?? -999) - (left.expectedValuePct ?? -999);
    }

    if (filters.sortBy === "edge_score") {
      return right.edgeScore.score - left.edgeScore.score;
    }

    if (filters.sortBy === "best_price") {
      return (
        (right.bestAvailableOddsAmerican ?? right.oddsAmerican) -
        (left.bestAvailableOddsAmerican ?? left.oddsAmerican)
      );
    }

    if (left.player.name !== right.player.name) {
      return left.player.name.localeCompare(right.player.name);
    }

    return right.edgeScore.score - left.edgeScore.score;
  });
}

function filterPropCards(props: PropCardView[], filters: PropFilters) {
  return props
    .filter((prop) => (filters.league === "ALL" ? true : prop.leagueKey === filters.league))
    .filter((prop) =>
      filters.marketType === "ALL" ? true : prop.marketType === filters.marketType
    )
    .filter((prop) => (filters.team === "all" ? true : prop.team.id === filters.team))
    .filter((prop) => (filters.player === "all" ? true : prop.player.id === filters.player))
    .filter((prop) =>
      filters.sportsbook === "all" ? true : prop.sportsbook.key === filters.sportsbook
    )
    .filter((prop) => (filters.valueFlag === "all" ? true : prop.valueFlag === filters.valueFlag));
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
  const props = sortPropCards(
    filterPropCards(
      mockDatabase.propAngles
        .map((entry) => buildPropCard(entry.id))
        .filter(Boolean) as PropCardView[],
      filters
    ),
    filters
  );
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
    props,
    coverage,
    leagues: mockDatabase.leagues,
    sportsbooks: mockDatabase.sportsbooks,
    teams: mockDatabase.teams,
    players: mockDatabase.players,
    source: "catalog" as const,
    sourceNote:
      props.length
        ? "Live props are thin right now, so SharkEdge is falling back to stored prop rows and market history instead of leaving the board empty."
        : "Live props are not available from the current backend right now, and no stored prop rows match this exact filter set yet.",
    providerHealth: buildProviderHealth({
      source: "catalog",
      healthySummary: "Live props are connected.",
      fallbackSummary:
        "The props desk is currently leaning on stored catalog rows because live prop coverage is thin or unavailable.",
      offlineSummary:
        "No live prop adapter is available for this request and no stored coverage is ready yet."
    })
  };
}

export async function getPropsExplorerData(filters: PropFilters) {
  const [liveData, storedData] = await Promise.all([
    withTimeoutFallback(getLivePropsExplorerData(filters), {
      timeoutMs: LIVE_PROPS_TIMEOUT_MS,
      fallback: null
    }),
    withTimeoutFallback(
      getStoredPropsExplorerData(filters),
      {
        timeoutMs: STORED_PROPS_TIMEOUT_MS,
        fallback: buildEmptyStoredPropsResult(
          "Stored prop history timed out for this request, so SharkEdge is keeping the props desk lean instead of hanging the route."
        )
      }
    )
  ]);

  if (!liveData) {
    if (storedData.props.length) {
      return {
        ...getMockPropsExplorerData(filters),
        props: await attachPropTrendSummaries(storedData.props),
        sportsbooks: storedData.sportsbooks.length ? storedData.sportsbooks : mockDatabase.sportsbooks,
        teams: storedData.teams.length ? storedData.teams : mockDatabase.teams,
        players: storedData.players.length ? storedData.players : mockDatabase.players,
        source: "catalog" as const,
        sourceNote: storedData.sourceNote,
        providerHealth: buildProviderHealth({
          source: "catalog",
          healthySummary: "Live props are connected.",
          fallbackSummary:
            "Stored worker snapshots are carrying the props desk while the live prop feed is unavailable.",
          offlineSummary:
            "The live prop feed is offline in this runtime."
        })
      };
    }

    return getMockPropsExplorerData(filters);
  }

  const mergedProps = await attachPropTrendSummaries(
    mergePropCatalogs(liveData.props, storedData.props)
  );

  if (mergedProps.length) {
    return {
      ...liveData,
      props: mergedProps,
      sportsbooks: Array.from(
        new Map(
          [...liveData.sportsbooks, ...storedData.sportsbooks].map((book) => [book.key, book] as const)
        ).values()
      ).sort((left, right) => left.name.localeCompare(right.name)),
      teams: Array.from(
        new Map(
          [...liveData.teams, ...storedData.teams].map((team) => [team.id, team] as const)
        ).values()
      ).sort((left, right) => left.name.localeCompare(right.name)),
      players: Array.from(
        new Map(
          [...liveData.players, ...storedData.players].map((player) => [player.id, player] as const)
        ).values()
      ).sort((left, right) => left.name.localeCompare(right.name)),
      sourceNote: storedData.props.length
        ? `${liveData.sourceNote} Stored prop history is filling coverage gaps and line-move context while the worker keeps snapshots fresh.`
        : liveData.sourceNote,
      providerHealth: liveData.providerHealth
    };
  }

  const fallback = getMockPropsExplorerData(filters);
  return {
    ...fallback,
    coverage: liveData.coverage,
    props: await attachPropTrendSummaries(storedData.props),
    sportsbooks: storedData.sportsbooks.length ? storedData.sportsbooks : fallback.sportsbooks,
    teams: storedData.teams.length ? storedData.teams : fallback.teams,
    players: storedData.players.length ? storedData.players : fallback.players,
    source: "catalog" as const,
    sourceNote: storedData.props.length
      ? `${liveData.sourceNote} Stored prop rows are filling the gap while the live feed is thin.`
      : `${liveData.sourceNote} Stored prop rows are not populated for this filter set yet.`,
    providerHealth: buildProviderHealth({
      source: "catalog",
      healthySummary: "Live props are connected.",
      fallbackSummary:
        "The props desk is using stored worker rows because the live feed is too thin for this filter set.",
      offlineSummary:
        "The props desk is missing both live and stored support for this filter set."
    })
  };
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

  const evPlays = data.props
    .filter(
      (prop) =>
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

  if (evPlays.length) {
    return evPlays;
  }

  return data.props
    .filter(
      (prop) =>
        typeof prop.lineMovement === "number" &&
        Math.abs(prop.lineMovement) >= 1.5 &&
        (prop.sportsbookCount ?? 0) >= 2
    )
    .sort((left, right) => {
      const movementDelta = Math.abs(right.lineMovement ?? 0) - Math.abs(left.lineMovement ?? 0);
      if (movementDelta !== 0) {
        return movementDelta;
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

  const storedProp = await getStoredPropById(propId);
  if (storedProp) {
    const [withTrend] = await attachPropTrendSummaries([storedProp]);
    return withTrend ?? storedProp;
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
    source: "mock",
    providerHealth: buildProviderHealth({
      source: "mock",
      healthySummary: "Live matchup detail is connected.",
      fallbackSummary:
        "This matchup is leaning on stored catalog context because the live detail adapter is not available.",
      offlineSummary:
        "The live matchup detail adapter is offline in this runtime."
    })
  } satisfies GameDetailView;
}

export async function getGameDetail(id: string) {
  const [liveDetail, storedProps] = await Promise.all([
    withTimeoutFallback(getLiveGameDetail(id), {
      timeoutMs: LIVE_GAME_DETAIL_TIMEOUT_MS,
      fallback: null
    }),
    withTimeoutFallback(getStoredPropsForEvent(id), {
      timeoutMs: STORED_GAME_PROPS_TIMEOUT_MS,
      fallback: []
    })
  ]);
  if (liveDetail) {
    const mergedProps = await attachPropTrendSummaries(
      mergePropCatalogs(liveDetail.props, storedProps)
    );
    return {
      ...liveDetail,
      props: mergedProps,
      propsNotice:
        storedProps.length && !liveDetail.props.length
          ? "Live props are light for this matchup right now, so SharkEdge is leaning on stored worker snapshots and market history."
          : liveDetail.propsNotice
    };
  }

  const mock = getMockGameDetail(id);
  if (!mock) {
    return null;
  }

  if (!storedProps.length) {
    return mock;
  }

  return {
    ...mock,
    props: await attachPropTrendSummaries(storedProps),
    propsNotice:
      "This matchup is reading from stored worker-synced prop history because the live detail adapter is thin in this runtime.",
    providerHealth: buildProviderHealth({
      source: "catalog",
      healthySummary: "Live matchup detail is connected.",
      fallbackSummary:
        "Stored matchup context and prop history are carrying this page while the live detail adapter is thin.",
      offlineSummary:
        "The live matchup detail adapter is offline in this runtime."
    })
  };
}
