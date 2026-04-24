import { withTimeoutFallback } from "@/lib/utils/async";
import type {
  LeagueKey,
  PlayerRecord,
  PropCardView,
  PropFilters,
  SportsbookRecord,
  TeamRecord
} from "@/lib/types/domain";
import { propsFiltersSchema } from "@/lib/validation/filters";
import { buildProviderHealth } from "@/services/providers/provider-health";

const LIVE_PROPS_TIMEOUT_MS = 3_500;
const PROPS_FALLBACK_LEAGUES: LeagueKey[] = [
  "NBA",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
];

async function getMockDatabase() {
  return (await import("@/prisma/seed-data")).mockDatabase;
}

async function getLiveOddsService() {
  return import("@/services/odds/live-props-data");
}

async function getProviderRegistry() {
  return import("@/services/providers/registry");
}

async function getTrendsService() {
  return import("@/services/trends/trends-service");
}

async function attachPropTrendSummaries(props: PropCardView[]) {
  if (!props.length) {
    return props;
  }

  const { getPropTrendSummaries } = await getTrendsService();
  const summaries = await getPropTrendSummaries(props);
  return props.map((prop) => ({
    ...prop,
    trendSummary: prop.trendSummary ?? summaries[prop.id] ?? null
  }));
}

async function buildPropsCoverage() {
  const { getProviderRegistryEntry } = await getProviderRegistry();

  return PROPS_FALLBACK_LEAGUES.map((leagueKey) => {
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

async function buildEmptyPropsExplorerData(filters: PropFilters) {
  const mockDatabase = await getMockDatabase();
  return {
    filters,
    props: [] as PropCardView[],
    coverage: await buildPropsCoverage(),
    leagues: mockDatabase.leagues,
    sportsbooks: mockDatabase.sportsbooks,
    teams: mockDatabase.teams,
    players: mockDatabase.players,
    source: "catalog" as const,
    sourceNote:
      "Live props are not available from the current backend right now, and stored prop rows are not populated for this filter set yet.",
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

export async function getPropsExplorerData(filters: PropFilters) {
  const { getLivePropsExplorerData } = await getLiveOddsService();
  const liveData = await withTimeoutFallback(getLivePropsExplorerData(filters), {
      timeoutMs: LIVE_PROPS_TIMEOUT_MS,
      fallback: null
    });

  if (!liveData) {
    return buildEmptyPropsExplorerData(filters);
  }

  const mergedProps = await attachPropTrendSummaries(liveData.props);

  return {
    ...liveData,
    props: mergedProps,
    coverage: liveData.coverage.length ? liveData.coverage : await buildPropsCoverage(),
    sourceNote: liveData.sourceNote,
    providerHealth: liveData.providerHealth
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
    .filter((prop) => typeof prop.expectedValuePct === "number" && prop.expectedValuePct > 0)
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
  const { getLivePropById } = await getLiveOddsService();
  const liveProp = await withTimeoutFallback(getLivePropById(propId), {
    timeoutMs: LIVE_PROPS_TIMEOUT_MS,
    fallback: null
  });
  if (liveProp) {
    const [withTrend] = await attachPropTrendSummaries([liveProp]);
    return withTrend ?? liveProp;
  }

  return null;
}
