import { ingestUfcMarketOdds, type UfcMarketOddsIngestionResult, type UfcMarketOddsItem } from "@/services/ufc/market-odds-ingestion";

export type OddsApiIoUfcMoneylineOptions = {
  dryRun?: boolean;
  horizonDays?: number;
  apiKey?: string;
  bookmakers?: string;
  sport?: string;
  league?: string;
  eventLimit?: number;
  minMatchScore?: number;
  fetchImpl?: typeof fetch;
};

type OddsApiIoEvent = {
  id?: number | string;
  home?: string;
  away?: string;
  date?: string;
  status?: string;
  sport?: { name?: string; slug?: string } | string;
  league?: { name?: string; slug?: string } | string;
  bookmakers?: unknown;
};

type OddsApiIoSport = { name?: string; slug?: string };
type OddsApiIoLeague = { name?: string; slug?: string; eventsCount?: number };

type OddsApiIoEventOdds = OddsApiIoEvent & {
  bookmakers?: Record<string, Array<{ name?: string; odds?: Array<Record<string, unknown>>; updatedAt?: string }>>;
};

export type OddsApiIoUfcMoneylineResult = UfcMarketOddsIngestionResult & {
  fetched: boolean;
  baseUrl: string;
  sport: string | null;
  league: string | null;
  eventCount: number;
  oddsEventCount: number;
  requestCount: number;
  keySource: string | null;
  keyPoolSize: number;
  rateLimit: {
    limit: string | null;
    remaining: string | null;
    reset: string | null;
  };
};

const BASE_URL = "https://api.odds-api.io/v3";
const DEFAULT_BOOKMAKERS = "DraftKings,FanDuel,BetMGM,ESPN BET,bet365";
const SPORT_CANDIDATES = ["mma", "mixed-martial-arts", "combat-sports", "ufc"];
const LEAGUE_CANDIDATES = ["ufc", "ultimate-fighting-championship"];

function splitEnv(value: string | null) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function resolveApiKey(explicit?: string) {
  if (explicit?.trim()) return { key: explicit.trim(), source: "explicit", poolSize: 1 };
  const pooled = splitEnv(envValue("ODDS_API_IO_KEYS", "UFC_ODDS_API_IO_KEYS"));
  if (pooled.length) {
    const bucket = Math.floor(Date.now() / 3_600_000);
    return { key: pooled[bucket % pooled.length], source: "pooled", poolSize: pooled.length };
  }
  const single = envValue("ODDS_API_IO_KEY", "UFC_ODDS_API_IO_KEY");
  return single ? { key: single, source: "single", poolSize: 1 } : { key: null, source: null, poolSize: 0 };
}

function normalize(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function compact(value: unknown) {
  return normalize(value).replace(/\s+/g, "-");
}

function decimalToAmerican(value: unknown) {
  const decimal = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/^\+/, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function isMoneylineMarket(name: unknown) {
  const n = normalize(name);
  return n === "ml" || n === "moneyline" || n === "match winner" || n === "fight winner" || n === "winner";
}

function bestSport(sports: OddsApiIoSport[], configured?: string) {
  if (configured) return configured;
  for (const candidate of SPORT_CANDIDATES) {
    const found = sports.find((sport) => compact(sport.slug ?? sport.name) === candidate || normalize(sport.name).includes(candidate.replace(/-/g, " ")));
    if (found?.slug) return found.slug;
  }
  return "mma";
}

function bestLeague(leagues: OddsApiIoLeague[], configured?: string) {
  if (configured) return configured;
  for (const candidate of LEAGUE_CANDIDATES) {
    const found = leagues.find((league) => compact(league.slug ?? league.name) === candidate || normalize(league.name).includes(candidate));
    if (found?.slug) return found.slug;
  }
  return leagues[0]?.slug ?? null;
}

function buildUrl(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const url = new URL(`${BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function fetchJson<T>(fetchImpl: typeof fetch, path: string, params: Record<string, string | number | boolean | null | undefined>, rateLimit: OddsApiIoUfcMoneylineResult["rateLimit"]) {
  const response = await fetchImpl(buildUrl(path, params), { cache: "no-store", headers: { accept: "application/json" } });
  rateLimit.limit = response.headers.get("x-ratelimit-limit") ?? rateLimit.limit;
  rateLimit.remaining = response.headers.get("x-ratelimit-remaining") ?? rateLimit.remaining;
  rateLimit.reset = response.headers.get("x-ratelimit-reset") ?? rateLimit.reset;
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Odds-API.io ${path} returned ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  return await response.json() as T;
}

function marketOddsToItems(event: OddsApiIoEventOdds): UfcMarketOddsItem[] {
  const items: UfcMarketOddsItem[] = [];
  const home = event.home;
  const away = event.away;
  const bookmakers = event.bookmakers && typeof event.bookmakers === "object" && !Array.isArray(event.bookmakers) ? event.bookmakers : {};
  for (const [bookmaker, marketsValue] of Object.entries(bookmakers)) {
    for (const market of asArray<Record<string, unknown>>(marketsValue)) {
      if (!isMoneylineMarket(market.name)) continue;
      const firstOdds = asArray<Record<string, unknown>>(market.odds)[0] ?? {};
      const homeOdds = decimalToAmerican(firstOdds.home ?? firstOdds.Home) ?? numberFrom(firstOdds.homeAmerican ?? firstOdds.home_american);
      const awayOdds = decimalToAmerican(firstOdds.away ?? firstOdds.Away) ?? numberFrom(firstOdds.awayAmerican ?? firstOdds.away_american);
      if (!home || !away || homeOdds == null || awayOdds == null) continue;
      items.push({
        fighterA: away,
        fighterB: home,
        oddsA: awayOdds,
        oddsB: homeOdds,
        bookmaker,
        marketKey: "ML",
        source: "odds-api-io",
        eventName: `${away} vs ${home}`,
        eventDate: event.date,
        fetchedAt: typeof market.updatedAt === "string" ? market.updatedAt : new Date().toISOString(),
        raw: { eventId: event.id, bookmaker, market }
      });
    }
  }
  return items;
}

function emptyResult(args: { ok: boolean; dryRun?: boolean; error: string; keySource?: string | null; keyPoolSize?: number; sport?: string | null; league?: string | null; rateLimit?: OddsApiIoUfcMoneylineResult["rateLimit"] }): OddsApiIoUfcMoneylineResult {
  return {
    ok: args.ok,
    mode: args.dryRun ? "dry-run" : "write",
    source: "odds-api-io-ufc-moneyline",
    inputItems: 0,
    candidateFights: 0,
    matched: 0,
    updated: 0,
    unmatchedItems: [],
    matches: [],
    errors: [args.error],
    fetched: false,
    baseUrl: BASE_URL,
    sport: args.sport ?? null,
    league: args.league ?? null,
    eventCount: 0,
    oddsEventCount: 0,
    requestCount: 0,
    keySource: args.keySource ?? null,
    keyPoolSize: args.keyPoolSize ?? 0,
    rateLimit: args.rateLimit ?? { limit: null, remaining: null, reset: null }
  };
}

export async function fetchAndIngestOddsApiIoUfcMoneyline(options: OddsApiIoUfcMoneylineOptions = {}): Promise<OddsApiIoUfcMoneylineResult> {
  const resolvedKey = resolveApiKey(options.apiKey);
  const rateLimit = { limit: null, remaining: null, reset: null };
  if (!resolvedKey.key) {
    return emptyResult({ ok: false, dryRun: options.dryRun, error: "Missing ODDS_API_IO_KEY, UFC_ODDS_API_IO_KEY, ODDS_API_IO_KEYS, or UFC_ODDS_API_IO_KEYS.", keySource: resolvedKey.source, keyPoolSize: resolvedKey.poolSize, rateLimit });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const bookmakers = options.bookmakers ?? envValue("ODDS_API_IO_BOOKMAKERS", "UFC_ODDS_API_IO_BOOKMAKERS") ?? DEFAULT_BOOKMAKERS;
  const eventLimit = Math.max(1, Math.min(50, Math.floor(options.eventLimit ?? Number(envValue("ODDS_API_IO_EVENT_LIMIT") ?? 20))));
  let requestCount = 0;

  try {
    const sports = await fetchJson<OddsApiIoSport[]>(fetchImpl, "/sports", {}, rateLimit); requestCount += 1;
    const sport = bestSport(sports, options.sport ?? envValue("ODDS_API_IO_SPORT", "UFC_ODDS_API_IO_SPORT") ?? undefined);
    const leagues = await fetchJson<OddsApiIoLeague[]>(fetchImpl, "/leagues", { apiKey: resolvedKey.key, sport, all: true }, rateLimit); requestCount += 1;
    const league = bestLeague(leagues, options.league ?? envValue("ODDS_API_IO_LEAGUE", "UFC_ODDS_API_IO_LEAGUE") ?? undefined);
    const now = new Date();
    const to = new Date(now.getTime() + Math.max(1, options.horizonDays ?? 120) * 24 * 60 * 60 * 1000);
    const events = await fetchJson<OddsApiIoEvent[]>(fetchImpl, "/events", { apiKey: resolvedKey.key, sport, league, status: "pending,live", from: now.toISOString(), to: to.toISOString(), limit: eventLimit }, rateLimit); requestCount += 1;
    const eventIds = events.map((event) => event.id).filter((id): id is string | number => id != null).slice(0, eventLimit);
    const oddsPayloads: OddsApiIoEventOdds[] = [];
    for (let i = 0; i < eventIds.length; i += 10) {
      const batch = eventIds.slice(i, i + 10);
      if (!batch.length) continue;
      const response = await fetchJson<OddsApiIoEventOdds[] | OddsApiIoEventOdds>(fetchImpl, "/odds/multi", { apiKey: resolvedKey.key, eventIds: batch.join(","), bookmakers }, rateLimit); requestCount += 1;
      oddsPayloads.push(...(Array.isArray(response) ? response : [response]));
    }
    const items = oddsPayloads.flatMap(marketOddsToItems);
    const ingestion = await ingestUfcMarketOdds(items, {
      dryRun: options.dryRun,
      horizonDays: options.horizonDays,
      minMatchScore: options.minMatchScore,
      source: "odds-api-io-ufc-moneyline"
    });
    return {
      ...ingestion,
      fetched: true,
      baseUrl: BASE_URL,
      sport,
      league,
      eventCount: events.length,
      oddsEventCount: oddsPayloads.length,
      requestCount,
      keySource: resolvedKey.source,
      keyPoolSize: resolvedKey.poolSize,
      rateLimit
    };
  } catch (error) {
    return emptyResult({ ok: false, dryRun: options.dryRun, error: error instanceof Error ? error.message : String(error), keySource: resolvedKey.source, keyPoolSize: resolvedKey.poolSize, rateLimit });
  }
}
