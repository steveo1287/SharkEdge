import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { LeagueKey, TrendDashboardView, TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { buildMlbHistoricalTrendDashboard } from "@/services/trends/mlb-historical-dashboard";
import { getTrendDashboardSafe } from "@/services/trends/get-trend-dashboard-safe";
import { buildFallbackTrendDashboard } from "@/services/trends/fallback-dashboard";

export const TREND_DASHBOARD_CACHE_VERSION = "v3";
const TREND_DASHBOARD_CACHE_TTL_SECONDS = 10 * 60;
const TREND_DASHBOARD_STALE_TTL_SECONDS = 60 * 60;
const TREND_DASHBOARD_SIMPLE_DEFAULT_CACHE_KEY = `trends:dashboard:default:simple:${TREND_DASHBOARD_CACHE_VERSION}`;
const TREND_DASHBOARD_POWER_DEFAULT_CACHE_KEY = `trends:dashboard:default:power:${TREND_DASHBOARD_CACHE_VERSION}`;
const TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY = "trends:dashboard:default:v1";
const TREND_DASHBOARD_WARM_CONCURRENCY = 3;

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

export type TrendDashboardCacheHealth = {
  cacheVersion: string;
  requestedMode: TrendMode;
  exact: {
    key: string;
    ready: boolean;
    generatedAt: string | null;
    expiresAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
    cards: number;
  };
  modeDefault: {
    key: string;
    ready: boolean;
    generatedAt: string | null;
    expiresAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
    cards: number;
  };
  simpleDefault: {
    key: string;
    ready: boolean;
    generatedAt: string | null;
    expiresAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
    cards: number;
  };
  powerDefault: {
    key: string;
    ready: boolean;
    generatedAt: string | null;
    expiresAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
    cards: number;
  };
  legacyDefault: {
    key: string;
    ready: boolean;
    generatedAt: string | null;
    expiresAt: string | null;
    ageSeconds: number | null;
    stale: boolean;
    cards: number;
  };
  effectiveStatus: "exact" | "mode-default" | "legacy-default" | "cold";
  recommendedAction: string;
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

function requestedMode(options: DashboardOptions): TrendMode {
  return options.mode === "power" ? "power" : "simple";
}

function defaultCacheKeyForMode(mode: TrendMode) {
  return mode === "power" ? TREND_DASHBOARD_POWER_DEFAULT_CACHE_KEY : TREND_DASHBOARD_SIMPLE_DEFAULT_CACHE_KEY;
}

function cacheKey(filters: TrendFilters, options: DashboardOptions) {
  return `trends:dashboard:${TREND_DASHBOARD_CACHE_VERSION}:${stableStringify({ filters, options: {
    mode: requestedMode(options),
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
    && !(options.aiQuery ?? "").trim()
    && !options.savedTrendId;
}

function withPowerLanguage(payload: TrendDashboardView): TrendDashboardView {
  return {
    ...payload,
    mode: "power",
    sourceNote: `${payload.sourceNote} Power view prioritizes premium system research: ROI, win rate, sample, action gates, live qualifiers, CLV/market support, and kill switches.`,
    sampleNote: payload.sampleNote ?? "Power mode shows the full warmed system board instead of the clipped simple view."
  };
}

function withCacheStatusNote(payload: TrendDashboardView, status: FastDashboardResult["cacheStatus"], generatedAt: string | null, requestedFilters: TrendFilters, options: DashboardOptions): TrendDashboardView {
  const mode = requestedMode(options);
  const modePayload = mode === "power" ? withPowerLanguage(payload) : payload;
  if (status === "exact") {
    return {
      ...modePayload,
      mode,
      sourceNote: `${modePayload.sourceNote} Cache hit: exact ${mode} dashboard warmed ${generatedAt ? new Date(generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "recently"}.`
    };
  }
  if (status === "default") {
    return {
      ...modePayload,
      filters: requestedFilters,
      mode,
      aiQuery: options.aiQuery ?? modePayload.aiQuery,
      sourceNote: `${modePayload.sourceNote} Showing the last-good ${mode} default trend cache while this exact filter warms in the background.`,
      sampleNote: modePayload.sampleNote ?? `Filter-specific ${mode} trend cache was not hot yet, so the page loaded the last-good ${mode} dashboard instead of rebuilding during page render.`
    };
  }
  return modePayload;
}

function hasCards(view: TrendDashboardView | null | undefined): view is TrendDashboardView {
  return Boolean(view && Array.isArray(view.cards) && view.cards.length > 0);
}

async function buildHistoricalFirstDashboard(filters: TrendFilters, options: DashboardOptions) {
  const mode = requestedMode(options);
  const aiQuery = options.aiQuery ?? "";
  const savedTrendId = options.savedTrendId ?? null;
  const historical = await buildMlbHistoricalTrendDashboard(filters, { mode, aiQuery }).catch(() => null);
  if (hasCards(historical)) return mode === "power" ? withPowerLanguage(historical) : historical;
  const dashboard = await getTrendDashboardSafe(filters, { mode, aiQuery, savedTrendId });
  return mode === "power" ? withPowerLanguage(dashboard) : dashboard;
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
    options: { ...options, mode: requestedMode(options) },
    payload
  };
  await writeHotCache<CachedDashboardEnvelope>(key, envelope, TREND_DASHBOARD_STALE_TTL_SECONDS);
  if (isDefaultDashboardRequest(filters, options)) {
    await writeHotCache<CachedDashboardEnvelope>(defaultCacheKeyForMode(requestedMode(options)), envelope, TREND_DASHBOARD_STALE_TTL_SECONDS);
    if (requestedMode(options) === "simple") {
      await writeHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY, envelope, TREND_DASHBOARD_STALE_TTL_SECONDS);
    }
  }
  return payload;
}

export async function getFastCachedTrendDashboard(filters: TrendFilters, options: DashboardOptions = {}): Promise<FastDashboardResult> {
  const mode = requestedMode(options);
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

  const defaultKey = defaultCacheKeyForMode(mode);
  const defaultCached = await readHotCache<CachedDashboardEnvelope>(defaultKey);
  if (defaultCached?.payload) {
    return {
      payload: withCacheStatusNote(defaultCached.payload, "default", defaultCached.generatedAt, filters, options),
      cacheStatus: "default",
      generatedAt: defaultCached.generatedAt,
      expiresAt: defaultCached.expiresAt,
      key: defaultKey
    };
  }

  if (mode === "simple") {
    const legacyCached = await readHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY);
    if (legacyCached?.payload) {
      return {
        payload: withCacheStatusNote(legacyCached.payload, "default", legacyCached.generatedAt, filters, options),
        cacheStatus: "default",
        generatedAt: legacyCached.generatedAt,
        expiresAt: legacyCached.expiresAt,
        key: TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY
      };
    }
  }

  const fallback = buildFallbackTrendDashboard(filters);
  return {
    payload: {
      ...fallback,
      mode,
      aiQuery: options.aiQuery ?? "",
      sourceNote: mode === "power"
        ? "Power trend cache is cold. The page returned instantly without falling back to weak simple-mode cards; the warmer should populate the premium power board shortly."
        : "Trend cache is cold. The page returned instantly without running an expensive rebuild; the warmer should populate this shortly.",
      sampleNote: mode === "power"
        ? "No warmed power dashboard was available yet. This is a cache miss, not a page-render rebuild."
        : "No warmed trend dashboard was available. This is a cache miss, not a page-render rebuild."
    },
    cacheStatus: "miss",
    generatedAt: null,
    expiresAt: null,
    key
  };
}

function cacheHealthFromEnvelope(key: string, envelope: CachedDashboardEnvelope | null | undefined) {
  const generatedAt = envelope?.generatedAt ?? null;
  const expiresAt = envelope?.expiresAt ?? null;
  const generated = generatedAt ? new Date(generatedAt) : null;
  const expires = expiresAt ? new Date(expiresAt) : null;
  const ageSeconds = generated && Number.isFinite(generated.getTime()) ? Math.max(0, Math.floor((Date.now() - generated.getTime()) / 1000)) : null;
  const stale = expires && Number.isFinite(expires.getTime()) ? expires.getTime() <= Date.now() : !envelope?.payload;
  return {
    key,
    ready: Boolean(envelope?.payload),
    generatedAt,
    expiresAt,
    ageSeconds,
    stale,
    cards: envelope?.payload?.cards?.length ?? 0
  };
}

export async function getTrendDashboardCacheHealth(filters: TrendFilters, options: DashboardOptions = {}): Promise<TrendDashboardCacheHealth> {
  const mode = requestedMode(options);
  const exactKey = cacheKey(filters, options);
  const modeDefaultKey = defaultCacheKeyForMode(mode);
  const [exact, modeDefault, simpleDefault, powerDefault, legacyDefault] = await Promise.all([
    readHotCache<CachedDashboardEnvelope>(exactKey),
    readHotCache<CachedDashboardEnvelope>(modeDefaultKey),
    readHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_SIMPLE_DEFAULT_CACHE_KEY),
    readHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_POWER_DEFAULT_CACHE_KEY),
    readHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY)
  ]);
  const exactHealth = cacheHealthFromEnvelope(exactKey, exact);
  const modeDefaultHealth = cacheHealthFromEnvelope(modeDefaultKey, modeDefault);
  const simpleDefaultHealth = cacheHealthFromEnvelope(TREND_DASHBOARD_SIMPLE_DEFAULT_CACHE_KEY, simpleDefault);
  const powerDefaultHealth = cacheHealthFromEnvelope(TREND_DASHBOARD_POWER_DEFAULT_CACHE_KEY, powerDefault);
  const legacyDefaultHealth = cacheHealthFromEnvelope(TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY, legacyDefault);
  const effectiveStatus: TrendDashboardCacheHealth["effectiveStatus"] = exactHealth.ready
    ? "exact"
    : modeDefaultHealth.ready
      ? "mode-default"
      : mode === "simple" && legacyDefaultHealth.ready
        ? "legacy-default"
        : "cold";
  const recommendedAction = effectiveStatus === "exact"
    ? "Exact trend dashboard cache is warm."
    : effectiveStatus === "mode-default"
      ? `Exact cache is cold, but the ${mode} default cache is warm.`
      : effectiveStatus === "legacy-default"
        ? "Simple mode is using the legacy default cache. Let the warmer populate the new simple default key."
        : `The ${mode} trend cache is cold. Run /api/trends/refresh-cache or wait for the warmer.`;

  return {
    cacheVersion: TREND_DASHBOARD_CACHE_VERSION,
    requestedMode: mode,
    exact: exactHealth,
    modeDefault: modeDefaultHealth,
    simpleDefault: simpleDefaultHealth,
    powerDefault: powerDefaultHealth,
    legacyDefault: legacyDefaultHealth,
    effectiveStatus,
    recommendedAction
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
  const leagues = args?.leagues?.length ? args.leagues : ["ALL", "MLB", "NBA"] as Array<LeagueKey | "ALL">;
  const markets = args?.markets?.length ? args.markets : ["ALL", "moneyline", "spread", "total"] as Array<TrendFilters["market"]>;
  const modes: TrendMode[] = args?.mode ? [args.mode] : ["simple", "power"];
  const tasks: Array<() => Promise<{ league: string; market: string; mode: TrendMode; cards: number; ok: boolean; error?: string }>> = [];

  for (const mode of modes) {
    for (const league of leagues) {
      for (const market of markets) {
        tasks.push(async () => {
          const filters = baseFilters({ league, market, window: "90d", sample: 10 });
          try {
            const dashboard = await getCachedTrendDashboard(filters, { mode });
            return { league, market, mode, cards: dashboard.cards.length, ok: true };
          } catch (error) {
            return { league, market, mode, cards: 0, ok: false, error: error instanceof Error ? error.message : "Failed to warm trend cache." };
          }
        });
      }
    }
  }

  const warmed = await runWithConcurrency(tasks, TREND_DASHBOARD_WARM_CONCURRENCY);

  return {
    generatedAt: new Date().toISOString(),
    cacheVersion: TREND_DASHBOARD_CACHE_VERSION,
    ttlSeconds: TREND_DASHBOARD_CACHE_TTL_SECONDS,
    concurrency: TREND_DASHBOARD_WARM_CONCURRENCY,
    warmed
  };
}
