import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { LeagueKey, TrendDashboardView, TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { buildMlbHistoricalTrendDashboard } from "@/services/trends/mlb-historical-dashboard";
import { getTrendDashboardSafe } from "@/services/trends/get-trend-dashboard-safe";

const TREND_DASHBOARD_CACHE_TTL_SECONDS = 10 * 60;
const TREND_DASHBOARD_STALE_TTL_SECONDS = 60 * 60;

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
  await writeHotCache<CachedDashboardEnvelope>(key, {
    generatedAt: generatedAt.toISOString(),
    expiresAt: new Date(generatedAt.getTime() + TREND_DASHBOARD_CACHE_TTL_SECONDS * 1000).toISOString(),
    filters,
    options,
    payload
  }, TREND_DASHBOARD_STALE_TTL_SECONDS);
  return payload;
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

export async function warmTrendDashboardCaches(args?: { leagues?: Array<LeagueKey | "ALL">; markets?: Array<TrendFilters["market"]>; mode?: TrendMode }) {
  const leagues = args?.leagues?.length ? args.leagues : ["ALL", "MLB", "NBA", "NHL", "NFL", "NCAAF"] as Array<LeagueKey | "ALL">;
  const markets = args?.markets?.length ? args.markets : ["ALL", "moneyline", "spread", "total"] as Array<TrendFilters["market"]>;
  const warmed: Array<{ league: string; market: string; cards: number; ok: boolean; error?: string }> = [];

  for (const league of leagues) {
    for (const market of markets) {
      const filters = baseFilters({ league, market, window: "90d", sample: 10 });
      try {
        const dashboard = await getCachedTrendDashboard(filters, { mode: args?.mode ?? "simple" });
        warmed.push({ league, market, cards: dashboard.cards.length, ok: true });
      } catch (error) {
        warmed.push({ league, market, cards: 0, ok: false, error: error instanceof Error ? error.message : "Failed to warm trend cache." });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    ttlSeconds: TREND_DASHBOARD_CACHE_TTL_SECONDS,
    warmed
  };
}
