import { calculateEdgeScore } from "@/lib/utils/edge-score";
import { withTimeoutFallback } from "@/lib/utils/async";
import { formatAmericanOdds, formatLine } from "@/lib/formatters/odds";
import type {
  BoardMarketView,
  GameDetailView,
  GameRecord,
  GameOddsRow,
  TeamRecord
} from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";
import { analyzeMarket } from "@/services/market/market-analysis-service";
import type { MarketPriceSample } from "@/services/market/market-truth-service";
import { buildProviderHealth } from "@/services/providers/provider-health";
import { getStoredPropsForEvent } from "@/services/props/warehouse-service";
import { getLiveGameDetail } from "@/services/odds/live-odds";
import { getTeamStatComparison } from "@/services/stats/stats-service";
import { getPropTrendSummaries } from "@/services/trends/trends-service";

const LIVE_GAME_DETAIL_TIMEOUT_MS = 3_500;
const STORED_GAME_PROPS_TIMEOUT_MS = 2_500;

const leagueMap = new Map(mockDatabase.leagues.map((league) => [league.id, league] as const));
const teamMap = new Map(mockDatabase.teams.map((team) => [team.id, team] as const));
const playerMap = new Map(mockDatabase.players.map((player) => [player.id, player] as const));
const bookMap = new Map(mockDatabase.sportsbooks.map((book) => [book.id, book] as const));

async function attachPropTrendSummaries(props: GameDetailView["props"]) {
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

function buildUnavailableMarketView(): BoardMarketView {
  return {
    label: "No market",
    lineLabel: "No market",
    bestBook: "Unavailable",
    bestOdds: 0,
    movement: 0
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
  const oppositeCandidates = getMarketsForGame(game.id, marketType).filter(
    (market) => market.side === oppositeSide
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
    sideSamples: buildMockMarketSamples(game.id, marketType, primarySide),
    oppositeSamples: buildMockMarketSamples(game.id, marketType, oppositeSide),
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

function getGameAngle(gameId: string) {
  return mockDatabase.gameAngles.find((entry) => entry.gameId === gameId);
}

function buildOddsRow(game: GameRecord, sportsbook: (typeof mockDatabase.sportsbooks)[number]) {
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

function buildMockGameDetail(id: string): GameDetailView | null {
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
      spread: buildMockMarketView(game, "spread", "best"),
      moneyline: buildMockMarketView(game, "moneyline", "best"),
      total: buildMockMarketView(game, "total", "best")
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
    consensus: `${buildMockMarketView(game, "spread", "best").label} | ${buildMockMarketView(game, "total", "best").label}`,
    insights: [
      `${getTeam(game.homeTeamId).name} carry the stronger home split into this matchup.`,
      `${getTeam(game.awayTeamId).name} bring ${((matchup?.away.stats.recentForm as string) ?? "steady form")} over the last ten.`,
      "This matchup is using stored context while the live detail adapter is unavailable."
    ],
    injuries,
    props: [],
    matchup,
    lineMovement,
    marketRanges: [],
    propsNotice: "Live props are not available for this matchup right now.",
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
      storedProps.length ? [...liveDetail.props, ...storedProps.filter((stored) => !liveDetail.props.some((live) => live.id === stored.id))] : liveDetail.props
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

  const fallback = buildMockGameDetail(id);
  if (!fallback) {
    return null;
  }

  if (!storedProps.length) {
    return fallback;
  }

  return {
    ...fallback,
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
