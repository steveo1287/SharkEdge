import type { PropCardView, PropFilters } from "@/lib/types/domain";
import { calculateEdgeScore } from "@/lib/utils/edge-score";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { americanToImpliedProbability } from "@/lib/utils/odds";
import { buildProviderHealth } from "@/services/providers/provider-health";
import { analyzeMarket } from "@/services/market/market-analysis-service";
import type { MarketPriceSample } from "@/services/market/market-truth-service";

import {
  buildLivePlayerRecord,
  buildLiveSportsbookRecord,
  buildUnknownTeamRecord,
  getLeagueForSportKey,
  getLeagueRecord,
  getLiveTeamRecord,
  LIVE_PROP_SPORT_KEYS,
  PROP_COVERAGE_ORDER,
  normalizeName
} from "./live-reference";

const LIVE_PROPS_EVENT_LIMIT = 3;
const LIVE_PROPS_HARD_STALE_MINUTES = 20;

type LiveProp = {
  id: string;
  event_id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmaker_key: string;
  bookmaker_title: string;
  market_key: Extract<
    PropCardView["marketType"],
    "player_points" | "player_rebounds" | "player_assists" | "player_threes"
  >;
  player_name: string;
  player_external_id?: string | null;
  player_position?: string | null;
  team_name?: string | null;
  opponent_name?: string | null;
  team_resolved: boolean;
  side: string;
  line: number;
  price: number;
  last_update?: string;
};

type LivePropsSport = {
  key: string;
  title: string;
  short_title: string;
  event_count: number;
  game_count: number;
  prop_count: number;
  event_limit: number;
  events_scanned: number;
  partial: boolean;
  props: LiveProp[];
  errors: string[];
};

type LivePropsBoardResponse = {
  configured: boolean;
  generated_at: string;
  bookmakers: string;
  errors: string[];
  prop_count: number;
  event_limit: number;
  partial: boolean;
  quota_note?: string;
  sports: LivePropsSport[];
};

function getResponseAgeMinutes(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.max(0, (Date.now() - parsed) / 60000);
}

function isHardStale(value: string | null | undefined, thresholdMinutes: number) {
  const ageMinutes = getResponseAgeMinutes(value);
  return typeof ageMinutes === "number" && ageMinutes >= thresholdMinutes;
}

async function fetchLivePropsBoardResponse(
  sportKey?: string,
  maxEvents = LIVE_PROPS_EVENT_LIMIT
): Promise<LivePropsBoardResponse | null> {
  const backendUrl =
    process.env.SHARKEDGE_BACKEND_URL?.trim() || "https://shark-odds-1.onrender.com";

  const query = new URLSearchParams();
  if (sportKey) {
    query.set("sport_key", sportKey);
  }
  query.set("max_events", String(maxEvents));
  let response: LivePropsBoardResponse | null = null;
  try {
    const result = await fetch(`${backendUrl}/api/props/board?${query.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_500)
    });
    response = result.ok ? ((await result.json()) as LivePropsBoardResponse) : null;
  } catch {
    response = null;
  }

  if (!response?.configured) {
    return null;
  }

  if (isHardStale(response.generated_at, LIVE_PROPS_HARD_STALE_MINUTES)) {
    return null;
  }

  return response;
}

function buildLivePropGroupKey(prop: LiveProp) {
  return [
    prop.sport_key,
    prop.event_id,
    normalizeName(prop.player_name),
    prop.market_key,
    prop.side.toUpperCase(),
    String(prop.line),
    normalizeName(prop.team_name ?? "")
  ].join("|");
}

function buildLivePropFamilyKey(prop: LiveProp) {
  return [
    prop.sport_key,
    prop.event_id,
    normalizeName(prop.player_name),
    prop.market_key,
    String(prop.line),
    normalizeName(prop.team_name ?? "")
  ].join("|");
}

function getPropSupportNote(bookCount: number, teamResolved: boolean) {
  if (!teamResolved) {
    return "Team mapping is still partial for this live prop, so matchup context should be treated carefully.";
  }

  if (bookCount < 2) {
    return "Only one live book is posting this market right now, so price quality is thin.";
  }

  return "Live basketball prop feed is connected and this row is being ranked from live book comparisons.";
}

function getPropValueFlag(bookCount: number, delta: number | null) {
  if (bookCount >= 2) {
    return "BEST_PRICE" as const;
  }

  if (typeof delta === "number" && delta >= 12) {
    return "MARKET_PLUS" as const;
  }

  return "NONE" as const;
}

function buildPropAnalyticsSummary(args: {
  bookCount: number;
  averageOddsAmerican: number | null;
  bestAvailableOddsAmerican: number | null;
  lineMovement: number | null;
  teamResolved: boolean;
}) {
  const tags = [
    args.bookCount >= 3 ? "book depth" : args.bookCount >= 2 ? "multi-book" : "thin market",
    args.teamResolved ? "matchup tagged" : "team pending"
  ];

  const delta =
    typeof args.bestAvailableOddsAmerican === "number" && typeof args.averageOddsAmerican === "number"
      ? Number((args.bestAvailableOddsAmerican - args.averageOddsAmerican).toFixed(0))
      : null;

  return {
    tags,
    reason:
      args.bookCount >= 2
        ? "Live price comparison is available across multiple books for this prop family."
        : "This live prop is visible, but the market is still thin.",
    sampleSize: null,
    hitRatePct: null,
    bookCount: args.bookCount,
    lineMovement: args.lineMovement,
    clvProxyPct: delta,
    avgStat: null
  };
}

function buildLivePropCard(props: LiveProp[], allGroups: Map<string, LiveProp[]>) {
  const prop = props[0];
  if (!prop) {
    return null;
  }

  const leagueKey = getLeagueForSportKey(prop.sport_key);
  if (!leagueKey) {
    return null;
  }

  const awayTeam = getLiveTeamRecord(leagueKey, prop.away_team);
  const homeTeam = getLiveTeamRecord(leagueKey, prop.home_team);
  const teamResolved = Boolean(prop.team_resolved && prop.team_name && prop.opponent_name);
  const team = teamResolved
    ? getLiveTeamRecord(leagueKey, prop.team_name ?? prop.home_team)
    : buildUnknownTeamRecord(leagueKey, "Team TBD", `team_tbd_${normalizeName(prop.id)}`);
  const opponent = teamResolved
    ? getLiveTeamRecord(leagueKey, prop.opponent_name ?? prop.away_team)
    : buildUnknownTeamRecord(leagueKey, "Opponent TBD", `opponent_tbd_${normalizeName(prop.id)}`);
  const player = buildLivePlayerRecord({
    leagueKey,
    playerName: prop.player_name,
    playerExternalId: prop.player_external_id,
    playerPosition: prop.player_position,
    teamId: team.id
  });

  const uniqueBooks = Array.from(
    new Map(props.map((entry) => [`${entry.bookmaker_key}:${entry.side}:${entry.line}`, entry] as const)).values()
  );
  const oppositeGroups = Array.from(allGroups.values()).filter((group) => {
    const candidate = group[0];
    return Boolean(candidate) && buildLivePropFamilyKey(candidate) === buildLivePropFamilyKey(prop) && candidate.side !== prop.side;
  });
  const oppositeUniqueBooks = Array.from(
    new Map(
      oppositeGroups
        .flatMap((group) => group)
        .map((entry) => [`${entry.bookmaker_key}:${entry.side}:${entry.line}`, entry] as const)
    ).values()
  );

  const sideSamples: MarketPriceSample[] = uniqueBooks.map((entry) => ({
    bookKey: entry.bookmaker_key,
    bookName: entry.bookmaker_title,
    price: entry.price,
    line: entry.line,
    updatedAt: entry.last_update ?? null
  }));
  const oppositeSamples: MarketPriceSample[] = oppositeUniqueBooks.map((entry) => ({
    bookKey: entry.bookmaker_key,
    bookName: entry.bookmaker_title,
    price: entry.price,
    line: entry.line,
    updatedAt: entry.last_update ?? null
  }));

  const bestEntry = [...uniqueBooks].sort((left, right) => right.price - left.price)[0] ?? prop;
  const averageOddsAmerican = uniqueBooks.length
    ? Number((uniqueBooks.reduce((sum, entry) => sum + entry.price, 0) / uniqueBooks.length).toFixed(0))
    : null;
  const bestAvailableOddsAmerican = bestEntry.price;
  const marketDeltaAmerican =
    averageOddsAmerican !== null ? Number((bestAvailableOddsAmerican - averageOddsAmerican).toFixed(0)) : null;
  const lineMovement = null;
  const analysis = analyzeMarket({
    marketLabel: `${player.name} ${prop.market_key.replace(/_/g, " ")}`,
    sport: getLeagueRecord(leagueKey).sport,
    league: leagueKey,
    eventId: prop.event_id,
    providerEventId: prop.event_id,
    marketType: prop.market_key,
    marketScope: "player",
    side: prop.side.toUpperCase(),
    oppositeSide: oppositeGroups[0]?.[0]?.side?.toUpperCase() ?? null,
    line: prop.line,
    participantTeamId: teamResolved ? team.id : null,
    participantPlayerId: player.id,
    offeredSportsbookKey: bestEntry.bookmaker_key,
    offeredOddsAmerican: bestEntry.price,
    sideSamples,
    oppositeSamples,
    lineMovement,
    supportNote: getPropSupportNote(uniqueBooks.length, teamResolved),
    sourceName: "Live prop feed",
    sourceType: "api",
    isLive: false
  });

  return {
    id: prop.id,
    gameId: prop.event_id,
    leagueKey,
    sportsbook: buildLiveSportsbookRecord(bestEntry.bookmaker_key, bestEntry.bookmaker_title),
    player,
    team,
    opponent,
    marketType: prop.market_key,
    side: prop.side,
    line: prop.line,
    oddsAmerican: bestEntry.price,
    recentHitRate: null,
    matchupRank: null,
    gameLabel: `${awayTeam.abbreviation} @ ${homeTeam.abbreviation}`,
    teamResolved,
    sportsbookCount: uniqueBooks.length,
    bestAvailableOddsAmerican,
    bestAvailableSportsbookName: bestEntry.bookmaker_title,
    averageOddsAmerican,
    marketDeltaAmerican,
    expectedValuePct: analysis.expectedValuePct,
    lineMovement,
    valueFlag: getPropValueFlag(uniqueBooks.length, marketDeltaAmerican),
    supportStatus: uniqueBooks.length >= 2 ? "LIVE" : "PARTIAL",
    supportNote: getPropSupportNote(uniqueBooks.length, teamResolved),
    gameHref: buildMatchupHref(leagueKey, prop.event_id),
    canonicalMarketKey: analysis.canonicalMarketKey,
    analyticsSummary: buildPropAnalyticsSummary({
      bookCount: uniqueBooks.length,
      averageOddsAmerican,
      bestAvailableOddsAmerican,
      lineMovement,
      teamResolved
    }),
    trendSummary: null,
    marketTruth: analysis.marketTruth,
    fairPrice: analysis.fairPrice,
    evProfile: analysis.ev,
    marketIntelligence: analysis.marketIntelligence,
    reasons: analysis.reasons,
    confidenceBand: analysis.confidenceBand,
    confidenceScore: analysis.confidenceScore,
    hidden: analysis.hidden,
    source: "live",
    edgeScore: calculateEdgeScore({
      impliedProbability:
        typeof bestAvailableOddsAmerican === "number"
          ? americanToImpliedProbability(bestAvailableOddsAmerican)
          : null,
      recentHitRate: uniqueBooks.length >= 3 ? 0.58 : uniqueBooks.length >= 2 ? 0.54 : 0.5,
      lineMovementSupport: 0.25,
      volatility: Math.max(0.22, 1 - uniqueBooks.length / 8)
    })
  } satisfies PropCardView;
}

function buildLivePropCards(props: LiveProp[]) {
  const groups = props.reduce<Map<string, LiveProp[]>>((map, prop) => {
    const key = buildLivePropGroupKey(prop);
    map.set(key, [...(map.get(key) ?? []), prop]);
    return map;
  }, new Map());

  return Array.from(groups.values()).map((group) => buildLivePropCard(group, groups)).filter(Boolean) as PropCardView[];
}

async function buildPropsCoverage() {
  const { getProviderRegistryEntry } = await import("@/services/providers/registry");

  return PROP_COVERAGE_ORDER.map((leagueKey) => {
    const registry = getProviderRegistryEntry(leagueKey);
    return {
      leagueKey,
      status: registry.propsStatus,
      providers: registry.propsProviders,
      supportedMarkets: registry.supportedPropMarkets,
      note: registry.propsNote
    };
  });
}

function sortFilteredProps(filters: PropFilters, props: PropCardView[]) {
  return props
    .filter((prop) => (filters.league === "ALL" ? true : prop.leagueKey === filters.league))
    .filter((prop) => (filters.marketType === "ALL" ? true : prop.marketType === filters.marketType))
    .filter((prop) => (filters.team === "all" ? true : prop.team.id === filters.team))
    .filter((prop) => (filters.player === "all" ? true : prop.player.id === filters.player))
    .filter((prop) => (filters.sportsbook === "all" ? true : prop.sportsbook.key === filters.sportsbook))
    .filter((prop) => (filters.valueFlag === "all" ? true : prop.valueFlag === filters.valueFlag))
    .sort((left, right) => {
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
        return (right.bestAvailableOddsAmerican ?? right.oddsAmerican) - (left.bestAvailableOddsAmerican ?? left.oddsAmerican);
      }

      if (left.player.name !== right.player.name) {
        return left.player.name.localeCompare(right.player.name);
      }

      return right.edgeScore.score - left.edgeScore.score;
    });
}

export async function getLivePropsExplorerData(filters: PropFilters) {
  const requestedSportKeys =
    filters.league === "ALL"
      ? (Object.values(LIVE_PROP_SPORT_KEYS).filter(Boolean) as string[])
      : LIVE_PROP_SPORT_KEYS[filters.league]
        ? [LIVE_PROP_SPORT_KEYS[filters.league] as string]
        : [];

  const responses = (
    await Promise.all(requestedSportKeys.map((sportKey) => fetchLivePropsBoardResponse(sportKey, LIVE_PROPS_EVENT_LIMIT)))
  ).filter(Boolean) as LivePropsBoardResponse[];

  const allProps = responses.flatMap((response) => response.sports.flatMap((sport) => sport.props ?? []));
  const mappedProps = buildLivePropCards(allProps);
  const filteredProps = sortFilteredProps(filters, mappedProps);

  const sportsbooks = Array.from(
    new Map(mappedProps.map((prop) => [prop.sportsbook.key, prop.sportsbook] as const)).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  const teams = Array.from(
    new Map(mappedProps.filter((prop) => prop.teamResolved).map((prop) => [prop.team.id, prop.team] as const)).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  const players = Array.from(
    new Map(mappedProps.map((prop) => [prop.player.id, prop.player] as const)).values()
  ).sort((left, right) => left.name.localeCompare(right.name));

  const responseErrors = responses.flatMap((response) => response.errors ?? []);
  const quotaNotes = responses.map((response) => response.quota_note).filter(Boolean).join(" ");

  return {
    filters,
    props: filteredProps,
    coverage: await buildPropsCoverage(),
    leagues: PROP_COVERAGE_ORDER.map((leagueKey) => getLeagueRecord(leagueKey)),
    sportsbooks,
    teams,
    players,
    source: responses.length ? ("live" as const) : ("catalog" as const),
    sourceNote: responseErrors.length
      ? `Live props are partially connected, but the backend reported provider warnings: ${responseErrors.join(" | ")} ${quotaNotes}`.trim()
      : responses.length
        ? `${quotaNotes || "Live props are connected league-by-league to protect API quota."} Sports without a real props adapter stay visible as PARTIAL or COMING SOON instead of showing fake empty boards.`
        : "No live props adapter responded for the selected league set. SharkEdge is keeping unsupported sports visible and honest instead of backfilling fake prop rows.",
    providerHealth: buildProviderHealth({
      supportStatus: responseErrors.length || responses.some((response) => response.partial) ? "PARTIAL" : "LIVE",
      source: responses.length ? "live" : "catalog",
      generatedAt: responses[0]?.generated_at ?? null,
      warnings: responseErrors,
      healthySummary: "Live props are connected for the supported leagues in this runtime.",
      degradedSummary:
        "Live props are connected, but warnings, partial scans, or quota pressure are reducing coverage depth.",
      fallbackSummary:
        "The props desk is leaning on stored or catalog coverage while the live prop feed is thin.",
      offlineSummary: "No live prop adapter responded for this request."
    })
  };
}

export async function getLivePropById(propId: string): Promise<PropCardView | null> {
  const responses = (
    await Promise.all(
      Object.values(LIVE_PROP_SPORT_KEYS)
        .filter(Boolean)
        .map((sportKey) => fetchLivePropsBoardResponse(sportKey, LIVE_PROPS_EVENT_LIMIT))
    )
  ).filter(Boolean) as LivePropsBoardResponse[];

  const allProps = responses.flatMap((response) => response.sports.flatMap((sport) => sport.props ?? []));
  return buildLivePropCards(allProps).find((prop) => prop.id === propId) ?? null;
}
