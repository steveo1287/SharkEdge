import { ingestUfcMarketOdds, type UfcMarketOddsIngestionResult } from "@/services/ufc/market-odds-ingestion";

export type FetchUfcMoneylineOddsOptions = {
  dryRun?: boolean;
  horizonDays?: number;
  regions?: string;
  bookmakers?: string;
  sportKey?: string;
  apiKey?: string;
  minMatchScore?: number;
  fetchImpl?: typeof fetch;
};

export type FetchUfcMoneylineOddsResult = UfcMarketOddsIngestionResult & {
  fetched: boolean;
  endpoint: string | null;
  sportKey: string;
  regions: string | null;
  bookmakers: string | null;
  apiKeySource: string | null;
  keyPoolSize: number;
  requestsRemaining: string | null;
  requestsUsed: string | null;
  requestsLast: string | null;
};

const DEFAULT_SPORT_KEY = "mma_mixed_martial_arts";
const DEFAULT_REGIONS = "us";

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function splitKeys(value: string | null) {
  return (value ?? "").split(",").map((key) => key.trim()).filter(Boolean);
}

function resolveApiKey(explicit?: string) {
  if (explicit?.trim()) return { key: explicit.trim(), source: "explicit", poolSize: 1 };
  const pooled = splitKeys(envValue("UFC_ODDS_API_KEYS", "ODDS_API_KEYS", "THE_ODDS_API_KEYS"));
  if (pooled.length) {
    const bucket = Math.floor(Date.now() / 3_600_000);
    return { key: pooled[bucket % pooled.length], source: "pooled", poolSize: pooled.length };
  }
  const single = envValue("THE_ODDS_API_KEY", "ODDS_API_KEY", "UFC_ODDS_API_KEY");
  return single ? { key: single, source: "single", poolSize: 1 } : { key: null, source: null, poolSize: 0 };
}

function buildOddsApiUrl(args: { apiKey: string; sportKey: string; regions: string | null; bookmakers: string | null }) {
  const url = new URL(`https://api.the-odds-api.com/v4/sports/${encodeURIComponent(args.sportKey)}/odds/`);
  url.searchParams.set("apiKey", args.apiKey);
  url.searchParams.set("markets", "h2h");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  if (args.bookmakers) url.searchParams.set("bookmakers", args.bookmakers);
  else if (args.regions) url.searchParams.set("regions", args.regions);
  return url;
}

function redactedUrl(url: URL) {
  const clone = new URL(url.toString());
  if (clone.searchParams.has("apiKey")) clone.searchParams.set("apiKey", "REDACTED");
  return clone.toString();
}

function emptyResult(args: { ok: boolean; error: string; dryRun?: boolean; sportKey: string; regions: string | null; bookmakers: string | null; apiKeySource?: string | null; keyPoolSize?: number }): FetchUfcMoneylineOddsResult {
  return {
    ok: args.ok,
    mode: args.dryRun ? "dry-run" : "write",
    source: "the-odds-api-mma-moneyline",
    inputItems: 0,
    candidateFights: 0,
    matched: 0,
    updated: 0,
    unmatchedItems: [],
    matches: [],
    errors: [args.error],
    fetched: false,
    endpoint: null,
    sportKey: args.sportKey,
    regions: args.regions,
    bookmakers: args.bookmakers,
    apiKeySource: args.apiKeySource ?? null,
    keyPoolSize: args.keyPoolSize ?? 0,
    requestsRemaining: null,
    requestsUsed: null,
    requestsLast: null
  };
}

export async function fetchAndIngestUfcMoneylineOdds(options: FetchUfcMoneylineOddsOptions = {}): Promise<FetchUfcMoneylineOddsResult> {
  const resolvedKey = resolveApiKey(options.apiKey);
  const sportKey = options.sportKey ?? envValue("UFC_ODDS_API_SPORT_KEY") ?? DEFAULT_SPORT_KEY;
  const regions = options.regions ?? envValue("UFC_ODDS_API_REGIONS") ?? DEFAULT_REGIONS;
  const bookmakers = options.bookmakers ?? envValue("UFC_ODDS_API_BOOKMAKERS");
  if (!resolvedKey.key) {
    return emptyResult({ ok: false, error: "Missing THE_ODDS_API_KEY, ODDS_API_KEY, UFC_ODDS_API_KEY, or ODDS_API_KEYS for UFC moneyline odds.", dryRun: options.dryRun, sportKey, regions, bookmakers, apiKeySource: resolvedKey.source, keyPoolSize: resolvedKey.poolSize });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildOddsApiUrl({ apiKey: resolvedKey.key, sportKey, regions, bookmakers });
  const response = await fetchImpl(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const endpoint = redactedUrl(url);
  const requestsRemaining = response.headers.get("x-requests-remaining");
  const requestsUsed = response.headers.get("x-requests-used");
  const requestsLast = response.headers.get("x-requests-last");

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      ...emptyResult({ ok: false, error: `The Odds API returned ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`, dryRun: options.dryRun, sportKey, regions, bookmakers, apiKeySource: resolvedKey.source, keyPoolSize: resolvedKey.poolSize }),
      fetched: true,
      endpoint,
      requestsRemaining,
      requestsUsed,
      requestsLast
    };
  }

  const payload = await response.json();
  const ingestion = await ingestUfcMarketOdds(payload, {
    dryRun: options.dryRun,
    horizonDays: options.horizonDays,
    minMatchScore: options.minMatchScore,
    source: "the-odds-api-mma-moneyline"
  });

  return {
    ...ingestion,
    fetched: true,
    endpoint,
    sportKey,
    regions,
    bookmakers,
    apiKeySource: resolvedKey.source,
    keyPoolSize: resolvedKey.poolSize,
    requestsRemaining,
    requestsUsed,
    requestsLast
  };
}
