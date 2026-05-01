import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { LeagueKey, TrendDashboardView, TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { buildMlbHistoricalTrendDashboard } from "@/services/trends/mlb-historical-dashboard";
import { getTrendDashboardSafe } from "@/services/trends/get-trend-dashboard-safe";
import { buildFallbackTrendDashboard } from "@/services/trends/fallback-dashboard";

const TREND_DASHBOARD_CACHE_TTL_SECONDS = 10 * 60;
const TREND_DASHBOARD_STALE_TTL_SECONDS = 60 * 60;
const TREND_DASHBOARD_DEFAULT_CACHE_KEY = "trends:dashboard:default:v1";
const TREND_DASHBOARD_WARM_CONCURRENCY = 4;

type DashboardOptions = {
  mode?: TrendMode;
  aiQuery?: string;
  savedTrendId?: string | null;
};

type CachedDashboardEnvelope = {
  generatedAt: string;
  expiresAt: string;
  filters: TrendFilters;
  options: DashboardOptions;
  payload: TrendDashboardView;
};

type FastDashboardResult = {
  payload: TrendDashboardView;
  cacheStatus: "exact" | "default" | "miss";
  generatedAt: string | null;
  expiresAt: string | null;
  key: string;
};

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function cacheKey(filters: TrendFilters, options: DashboardOptions) {
  return `trends:dashboard:v2:${stableStringify({ filters, options: {
    mode: options.mode ?? "simple",
    aiQuery: options.aiQuery ?? "",
    savedTrendId: options.savedTrendId ?? null
  } })}`;
}

function isDefaultDashboardRequest(filters: TrendFilters, options: DashboardOptions) {
  return filters.sport === "ALL"
    && filters.league === "ALL"
    && filters.market === "ALL"
    && filters.sportsbook === "all"
    && filters.side === "ALL"
    && !filters.subject
    && !filters.team
    && !filters.player
    && !filters.fighter
    && !filters.opponent
    && filters.window === "90d"
    && filters.sample === 10
    && (options.mode ?? "simple") === "simple"
    && !(options.aiQuery ?? "").trim()
    && !options.savedTrendId;
}

function withCacheStatusNote(payload: TrendDashboardView, status: FastDashboardResult["cacheStatus"], generatedAt: string | null, requestedFilters: TrendFilters, options: DashboardOptions): TrendDashboardView {
  if (status === "exact") {
    return {
      ...payload,
      sourceNote: `${payload.sourceNote} Cache hit: exact dashboard warmed ${generatedAt ? new Date(generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "recently"}.`
    };
  }
  if (status === "default") {
    return {
      ...payload,
      filters: requestedFilters,
      mode: options.mode ?? payload.mode,
      aiQuery: options.aiQuery ?? payload.aiQuery,
      sourceNote: `${payload.sourceNote} Showing the last-good default trend cache while this exact filter warms in the background.`,
      sampleNote: payload.sampleNote ?? "Filter-specific trend cache was not hot yet, so the page loaded the last-good default dashboard instead of rebuilding during page render."
    };
  }
  return payload;
}

function hasCards(view: TrendDashboardView | null | undefined): view is TrendDashboardView {
  return Boolean(view && Array.isArray(view.cards) && view.cards.length > 0);
}

async function buildHistoricalFirstDashboard(filters: TrendFilters, options: DashboardOptions) {
  const mode = options.mode ?? "simple";
  const aiQuery = options.aiQuery ?? "";
  const savedTrendId = options.savedTrendId ?? null;
  const historical = await buildMlbHistoricalTrendDashboard(filters, { mode, aiQuery }).catch(() => null);
  if (hasCards(historical)) return historical;
  return getTrendDashboardSafe(filters, { mode, aiQuery, savedTrendId });
}

export async function getCachedTrendDashboard(filters: TrendFilters, options: DashboardOptions = {}) {
  const key = cacheKey(filters, options);
  const cached = await readHotCache<CachedDashboardEnvelope>(key);
  if (cached?.payload) return cached.payload;

  const payload = await buildHistoricalFirstDashboard(filters, options);
  const generatedAt = new Date();
  const envelope: CachedDashboardEnvelope = {
    generatedAt: generatedAt.toISOString(),
    expiresAt: new Date(generatedAt.getTime() + TREND_DASHBOARD_CACHE_TTL_SECONDS * 1000).toISOString(),
    filters,
    options,
    payload
  };
  await writeHotCache<CachedDashboardEnvelope>(key, envelope, TREND_DASHBOARD_STALE_TTL_SECONDS);
  if (isDefaultDashboardRequest(filters, options)) {
    await writeHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_DEFAULT_CACHE_KEY, envelope, TREND_DASHBOARD_STALE_TTL_SECONDS);
  }
  return payload;
}

export async function getFastCachedTrendDashboard(filters: TrendFilters, options: DashboardOptions = {}): Promise<FastDashboardResult> {
  const key = cacheKey(filters, options);
  const cached = await readHotCache<CachedDashboardEnvelope>(key);
  if (cached?.payload) {
    return {
      payload: withCacheStatusNote(cached.payload, "exact", cached.generatedAt, filters, options),
      cacheStatus: "exact",
      generatedAt: cached.generatedAt,
      expiresAt: cached.expiresAt,
      key
    };
  }

  const defaultCached = await readHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_DEFAULT_CACHE_KEY);
  if (defaultCached?.payload) {
    return {
      payload: withCacheStatusNote(defaultCached.payload, "default", defaultCached.generatedAt, filters, options),
      cacheStatus: "default",
      generatedAt: defaultCached.generatedAt,
      expiresAt: defaultCached.expiresAt,
      key: TREND_DASHBOARD_DEFAULT_CACHE_KEY
    };
  }

  const fallback = buildFallbackTrendDashboard(filters);
  return {
    payload: {
      ...fallback,
      mode: options.mode ?? "simple",
      aiQuery: options.aiQuery ?? "",
      sourceNote: "Trend cache is cold. The page returned instantly without running an expensive rebuild; the 10-minute warmer should populate this shortly.",
      sampleNote: "No warmed trend dashboard was available. This is a cache miss, not a page-render rebuild."
    },
    cacheStatus: "miss",
    generatedAt: null,
    expiresAt: null,
    key
  };
}

function baseFilters(overrides: Partial<TrendFilters> = {}) {
  return trendFiltersSchema.parse({
    sport: "ALL",
    league: "ALL",
    market: "ALL",
    sportsbook: "all",
    side: "ALL",
    subject: "",
    team: "",
    player: "",
    fighter: "",
    opponent: "",
    window: "90d",
    sample: 10,
    ...overrides
  }) as TrendFilters;
}

async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number) {
  const output: T[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return output;
}

export async function warmTrendDashboardCaches(args?: { leagues?: Array<LeagueKey | "ALL">; markets?: Array<TrendFilters["market"]>; mode?: TrendMode }) {
  const leagues = args?.leagues?.length ? args.leagues : ["ALL", "MLB", "NBA", "NHL", "NFL", "NCAAF"] as Array<LeagueKey | "ALL">;
  const markets = args?.markets?.length ? args.markets : ["ALL", "moneyline", "spread", "total"] as Array<TrendFilters["market"]>;
  const tasks: Array<() => Promise<{ league: string; market: string; cards: number; ok: boolean; error?: string }>> = [];

  for (const league of leagues) {
    for (const market of markets) {
      tasks.push(async () => {
        const filters = baseFilters({ league, market, window: "90d", sample: 10 });
        try {
          const dashboard = await getCachedTrendDashboard(filters, { mode: args?.mode ?? "simple" });
          return { league, market, cards: dashboard.cards.length, ok: true };
        } catch (error) {
          return { league, market, cards: 0, ok: false, error: error instanceof Error ? error.message : "Failed to warm trend cache." };
        }
      });
    }
  }

  const warmed = await runWithConcurrency(tasks, TREND_DASHBOARD_WARM_CONCURRENCY);

  return {
    generatedAt: new Date().toISOString(),
    ttlSeconds: TREND_DASHBOARD_CACHE_TTL_SECONDS,
    concurrency: TREND_DASHBOARD_WARM_CONCURRENCY,
    warmed
  };
}
