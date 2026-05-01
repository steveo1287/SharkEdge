import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { LeagueKey, TrendDashboardView, TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { buildMlbHistoricalTrendDashboard } from "@/services/trends/mlb-historical-dashboard";
import { getTrendDashboardSafe } from "@/services/trends/get-trend-dashboard-safe";
import { buildFallbackTrendDashboard } from "@/services/trends/fallback-dashboard";
import { buildSignalTrendDashboard } from "@/services/trends/signal-dashboard";

export const TREND_DASHBOARD_CACHE_VERSION = "v5";
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
  cacheStatus: "exact" | "default" | "miss" | "live-build";
  generatedAt: string | null;
  expiresAt: string | null;
  key: string;
};

export type TrendDashboardCacheHealth = {
  cacheVersion: string;
  requestedMode: TrendMode;
  exact: { key: string; ready: boolean; generatedAt: string | null; expiresAt: string | null; ageSeconds: number | null; stale: boolean; cards: number };
  modeDefault: { key: string; ready: boolean; generatedAt: string | null; expiresAt: string | null; ageSeconds: number | null; stale: boolean; cards: number };
  simpleDefault: { key: string; ready: boolean; generatedAt: string | null; expiresAt: string | null; ageSeconds: number | null; stale: boolean; cards: number };
  powerDefault: { key: string; ready: boolean; generatedAt: string | null; expiresAt: string | null; ageSeconds: number | null; stale: boolean; cards: number };
  legacyDefault: { key: string; ready: boolean; generatedAt: string | null; expiresAt: string | null; ageSeconds: number | null; stale: boolean; cards: number };
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

function requestedMode(options: DashboardOptions): TrendMode { return options.mode === "power" ? "power" : "simple"; }
function defaultCacheKeyForMode(mode: TrendMode) { return mode === "power" ? TREND_DASHBOARD_POWER_DEFAULT_CACHE_KEY : TREND_DASHBOARD_SIMPLE_DEFAULT_CACHE_KEY; }
function cacheKey(filters: TrendFilters, options: DashboardOptions) {
  return `trends:dashboard:${TREND_DASHBOARD_CACHE_VERSION}:${stableStringify({ filters, options: { mode: requestedMode(options), aiQuery: options.aiQuery ?? "", savedTrendId: options.savedTrendId ?? null } })}`;
}
function isDefaultDashboardRequest(filters: TrendFilters, options: DashboardOptions) {
  return filters.sport === "ALL" && filters.league === "ALL" && filters.market === "ALL" && filters.sportsbook === "all" && filters.side === "ALL" && !filters.subject && !filters.team && !filters.player && !filters.fighter && !filters.opponent && filters.window === "90d" && filters.sample === 10 && !(options.aiQuery ?? "").trim() && !options.savedTrendId;
}
function withPowerLanguage(payload: TrendDashboardView): TrendDashboardView {
  return { ...payload, mode: "power", sourceNote: `${payload.sourceNote} Power view prioritizes premium system research: ROI, win rate, sample, action gates, live qualifiers, CLV/market support, and kill switches.`, sampleNote: payload.sampleNote ?? "Power mode shows the full warmed system board instead of the clipped simple view." };
}
function withCacheStatusNote(payload: TrendDashboardView, status: FastDashboardResult["cacheStatus"], generatedAt: string | null, requestedFilters: TrendFilters, options: DashboardOptions): TrendDashboardView {
  const mode = requestedMode(options);
  const modePayload = mode === "power" ? withPowerLanguage(payload) : payload;
  if (status === "exact") return { ...modePayload, mode, sourceNote: `${modePayload.sourceNote} Cache hit: exact ${mode} dashboard warmed ${generatedAt ? new Date(generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "recently"}.` };
  if (status === "default") return { ...modePayload, filters: requestedFilters, mode, aiQuery: options.aiQuery ?? modePayload.aiQuery, sourceNote: `${modePayload.sourceNote} Showing the last-good ${mode} default trend cache while this exact filter warms in the background.`, sampleNote: modePayload.sampleNote ?? `Filter-specific ${mode} trend cache was not hot yet, so the page loaded the last-good ${mode} dashboard instead of rebuilding during page render.` };
  if (status === "live-build") return { ...modePayload, mode, filters: requestedFilters, aiQuery: options.aiQuery ?? modePayload.aiQuery, sourceNote: `${modePayload.sourceNote} Cache was cold, so this request built live cards from current signals plus historical odds/game-history trend feeds and stored them for the next load.` };
  return modePayload;
}
function hasCards(view: TrendDashboardView | null | undefined): view is TrendDashboardView { return Boolean(view && Array.isArray(view.cards) && view.cards.length > 0); }

function dedupeById<T extends { id?: string | null; title?: string | null }>(items: T[]) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = item.id || item.title || JSON.stringify(item).slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function historicalCardScore(card: TrendDashboardView["cards"][number]) {
  const text = [card.title, card.note, card.explanation, card.whyItMatters, card.dateRange].filter(Boolean).join(" ").toUpperCase();
  let score = 0;
  if (/BACKTEST|HISTORICAL|EVENTMARKET|RETROSHEET|SAVED LEDGER|LEDGER VERIFIED/.test(text)) score += 500;
  if (/2011|FULL STORED RANGE|ALL HISTORY|SEASON/.test(text)) score += 150;
  score += Math.min(card.sampleSize ?? 0, 500);
  return score;
}

function mergeDashboards(args: {
  filters: TrendFilters;
  mode: TrendMode;
  aiQuery: string;
  signal: TrendDashboardView | null;
  historical: TrendDashboardView | null;
  legacy: TrendDashboardView | null;
}) {
  const base = args.signal ?? args.historical ?? args.legacy;
  if (!base) return null;

  const dashboards = [args.historical, args.signal, args.legacy].filter(hasCards);
  const cards = dedupeById(dashboards.flatMap((dashboard) => dashboard.cards))
    .sort((left, right) => historicalCardScore(right) - historicalCardScore(left));
  const metrics = dedupeById(dashboards.flatMap((dashboard) => dashboard.metrics));
  const insights = dedupeById(dashboards.flatMap((dashboard) => dashboard.insights));
  const movementRows = dedupeById(dashboards.flatMap((dashboard) => dashboard.movementRows));
  const segmentRows = dedupeById(dashboards.flatMap((dashboard) => dashboard.segmentRows));
  const todayMatches = dedupeById(dashboards.flatMap((dashboard) => dashboard.todayMatches ?? []));
  const savedSystems = dedupeById(dashboards.flatMap((dashboard) => dashboard.savedSystems ?? []));

  const historicalCount = args.historical?.cards?.length ?? 0;
  const signalCount = args.signal?.cards?.length ?? 0;
  const legacyCount = args.legacy?.cards?.length ?? 0;
  const historicalSourceNote = args.historical?.sourceNote ? ` Historical source: ${args.historical.sourceNote}` : "";
  const legacyNote = args.legacy?.sourceNote ? ` Query-engine source: ${args.legacy.sourceNote}` : "";

  return {
    ...base,
    mode: args.mode,
    aiQuery: args.aiQuery,
    filters: args.filters,
    cards,
    metrics,
    insights,
    movementRows,
    segmentRows,
    todayMatches,
    savedSystems,
    todayMatchesNote: [args.signal?.todayMatchesNote, args.historical?.todayMatchesNote, args.legacy?.todayMatchesNote].filter(Boolean).join(" ") || base.todayMatchesNote,
    sourceNote: `Merged trend dashboard: ${historicalCount} historical odds/game-history cards + ${signalCount} current signal/system cards + ${legacyCount} query-engine cards. Historical data is now loaded alongside live signals instead of being skipped by the first non-empty feed.${historicalSourceNote}${legacyNote}`,
    querySummary: [base.querySummary, args.historical?.querySummary, args.legacy?.querySummary].filter(Boolean).join(" | "),
    sampleNote: [
      args.historical?.sampleNote,
      args.signal?.sampleNote,
      args.legacy?.sampleNote,
      `Historical-first merge is active; seeded/provisional cards should rank below real saved-ledger/EventMarket/Retrosheet history when those rows exist.`
    ].filter(Boolean).join(" ")
  } satisfies TrendDashboardView;
}

async function buildDashboardPayload(filters: TrendFilters, options: DashboardOptions) {
  const mode = requestedMode(options);
  const aiQuery = options.aiQuery ?? "";
  const savedTrendId = options.savedTrendId ?? null;
  const [signalDashboard, historical, legacyDashboard] = await Promise.all([
    buildSignalTrendDashboard(filters, { mode, aiQuery }).catch(() => null),
    buildMlbHistoricalTrendDashboard(filters, { mode, aiQuery }).catch(() => null),
    getTrendDashboardSafe(filters, { mode, aiQuery, savedTrendId }).catch(() => null)
  ]);

  const merged = mergeDashboards({ filters, mode, aiQuery, signal: signalDashboard, historical, legacy: legacyDashboard });
  if (merged) return mode === "power" ? withPowerLanguage(merged) : merged;

  const fallback = buildFallbackTrendDashboard(filters);
  return mode === "power" ? withPowerLanguage(fallback) : fallback;
}

async function writeDashboardEnvelope(key: string, filters: TrendFilters, options: DashboardOptions, payload: TrendDashboardView) {
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
    if (requestedMode(options) === "simple") await writeHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY, envelope, TREND_DASHBOARD_STALE_TTL_SECONDS);
  }
  return envelope;
}

export async function getCachedTrendDashboard(filters: TrendFilters, options: DashboardOptions = {}) {
  const key = cacheKey(filters, options);
  const cached = await readHotCache<CachedDashboardEnvelope>(key);
  if (cached?.payload) return cached.payload;
  const payload = await buildDashboardPayload(filters, options);
  await writeDashboardEnvelope(key, filters, options, payload);
  return payload;
}

export async function getFastCachedTrendDashboard(filters: TrendFilters, options: DashboardOptions = {}): Promise<FastDashboardResult> {
  const mode = requestedMode(options);
  const key = cacheKey(filters, options);
  const cached = await readHotCache<CachedDashboardEnvelope>(key);
  if (cached?.payload && cached.payload.cards.length > 0) return { payload: withCacheStatusNote(cached.payload, "exact", cached.generatedAt, filters, options), cacheStatus: "exact", generatedAt: cached.generatedAt, expiresAt: cached.expiresAt, key };

  const defaultKey = defaultCacheKeyForMode(mode);
  const defaultCached = await readHotCache<CachedDashboardEnvelope>(defaultKey);
  if (defaultCached?.payload && defaultCached.payload.cards.length > 0) return { payload: withCacheStatusNote(defaultCached.payload, "default", defaultCached.generatedAt, filters, options), cacheStatus: "default", generatedAt: defaultCached.generatedAt, expiresAt: defaultCached.expiresAt, key: defaultKey };

  if (mode === "simple") {
    const legacyCached = await readHotCache<CachedDashboardEnvelope>(TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY);
    if (legacyCached?.payload && legacyCached.payload.cards.length > 0) return { payload: withCacheStatusNote(legacyCached.payload, "default", legacyCached.generatedAt, filters, options), cacheStatus: "default", generatedAt: legacyCached.generatedAt, expiresAt: legacyCached.expiresAt, key: TREND_DASHBOARD_LEGACY_DEFAULT_CACHE_KEY };
  }

  const built = await buildDashboardPayload(filters, options).catch(() => null);
  if (hasCards(built)) {
    const envelope = await writeDashboardEnvelope(key, filters, options, built);
    return { payload: withCacheStatusNote(built, "live-build", envelope.generatedAt, filters, options), cacheStatus: "live-build", generatedAt: envelope.generatedAt, expiresAt: envelope.expiresAt, key };
  }

  const fallback = buildFallbackTrendDashboard(filters);
  return { payload: { ...fallback, mode, aiQuery: options.aiQuery ?? "", sourceNote: mode === "power" ? "Power trend cache is cold and no live signal/system/historical cards could be built yet." : "Trend cache is cold and no live signal/system/historical cards could be built yet.", sampleNote: mode === "power" ? "No warmed power dashboard, live signal cards, or historical trend cards were available yet." : "No warmed dashboard, live signal cards, or historical trend cards were available yet." }, cacheStatus: "miss", generatedAt: null, expiresAt: null, key };
}

function cacheHealthFromEnvelope(key: string, envelope: CachedDashboardEnvelope | null | undefined) {
  const generatedAt = envelope?.generatedAt ?? null;
  const expiresAt = envelope?.expiresAt ?? null;
  const generated = generatedAt ? new Date(generatedAt) : null;
  const expires = expiresAt ? new Date(expiresAt) : null;
  const ageSeconds = generated && Number.isFinite(generated.getTime()) ? Math.max(0, Math.floor((Date.now() - generated.getTime()) / 1000)) : null;
  const stale = expires && Number.isFinite(expires.getTime()) ? expires.getTime() <= Date.now() : !envelope?.payload;
  return { key, ready: Boolean(envelope?.payload), generatedAt, expiresAt, ageSeconds, stale, cards: envelope?.payload?.cards?.length ?? 0 };
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
  const effectiveStatus: TrendDashboardCacheHealth["effectiveStatus"] = exactHealth.ready ? "exact" : modeDefaultHealth.ready ? "mode-default" : mode === "simple" && legacyDefaultHealth.ready ? "legacy-default" : "cold";
  const recommendedAction = effectiveStatus === "exact" ? "Exact trend dashboard cache is warm." : effectiveStatus === "mode-default" ? `Exact cache is cold, but the ${mode} default cache is warm.` : effectiveStatus === "legacy-default" ? "Simple mode is using the legacy default cache. Let the warmer populate the new simple default key." : `The ${mode} trend cache is cold. /trends will now build live cards from signals/systems/historical data instead of staying blank.`;
  return { cacheVersion: TREND_DASHBOARD_CACHE_VERSION, requestedMode: mode, exact: exactHealth, modeDefault: modeDefaultHealth, simpleDefault: simpleDefaultHealth, powerDefault: powerDefaultHealth, legacyDefault: legacyDefaultHealth, effectiveStatus, recommendedAction };
}

function baseFilters(overrides: Partial<TrendFilters> = {}) {
  return trendFiltersSchema.parse({ sport: "ALL", league: "ALL", market: "ALL", sportsbook: "all", side: "ALL", subject: "", team: "", player: "", fighter: "", opponent: "", window: "90d", sample: 10, ...overrides }) as TrendFilters;
}
async function runWithConcurrency<T>(tasks: Array<() => Promise<T>>, concurrency: number) {
  const output: T[] = [];
  let cursor = 0;
  async function worker() { while (cursor < tasks.length) { const index = cursor; cursor += 1; output[index] = await tasks[index](); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()));
  return output;
}
export async function warmTrendDashboardCaches(args?: { leagues?: Array<LeagueKey | "ALL">; markets?: Array<TrendFilters["market"]>; mode?: TrendMode }) {
  const leagues = args?.leagues?.length ? args.leagues : ["ALL", "MLB", "NBA"] as Array<LeagueKey | "ALL">;
  const markets = args?.markets?.length ? args.markets : ["ALL", "moneyline", "spread", "total"] as Array<TrendFilters["market"]>;
  const modes: TrendMode[] = args?.mode ? [args.mode] : ["simple", "power"];
  const tasks: Array<() => Promise<{ league: string; market: string; mode: TrendMode; cards: number; ok: boolean; error?: string }>> = [];
  for (const mode of modes) for (const league of leagues) for (const market of markets) tasks.push(async () => {
    const filters = baseFilters({ league, market, window: league === "MLB" || league === "ALL" ? "all" : "365d", sample: 10 });
    try {
      const dashboard = await getCachedTrendDashboard(filters, { mode });
      return { league, market, mode, cards: dashboard.cards.length, ok: true };
    } catch (error) {
      return { league, market, mode, cards: 0, ok: false, error: error instanceof Error ? error.message : "Failed to warm trend cache." };
    }
  });
  const warmed = await runWithConcurrency(tasks, TREND_DASHBOARD_WARM_CONCURRENCY);
  return { generatedAt: new Date().toISOString(), cacheVersion: TREND_DASHBOARD_CACHE_VERSION, ttlSeconds: TREND_DASHBOARD_CACHE_TTL_SECONDS, concurrency: TREND_DASHBOARD_WARM_CONCURRENCY, warmed };
}
