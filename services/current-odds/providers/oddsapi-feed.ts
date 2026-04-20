import type { LeagueKey } from "@/lib/types/domain";
import type { BookFeedProvider } from "../book-feed-provider-types";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];

const SPORT_MAP: Record<LeagueKey, string> = {
  NBA: "basketball_nba",
  NCAAB: "basketball_ncaab",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  NFL: "americanfootball_nfl",
  NCAAF: "americanfootball_ncaaf",
  UFC: "mma_mixed_martial_arts",
  BOXING: "boxing"
};

function buildOddsApiUrl(leagues: LeagueKey[]) {
  const sports = leagues
    .filter((league) => SUPPORTED_LEAGUES.includes(league))
    .map((league) => SPORT_MAP[league])
    .join(",");

  if (!sports) {
    return null;
  }

  const selectedApiKey = getPrimaryOddsApiKey();
  if (!selectedApiKey) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("apiKey", selectedApiKey);
  params.set("regions", "us");
  params.set("markets", "h2h,spreads,totals");
  params.set("oddsFormat", "american");
  params.set("dateFormat", "iso");

  return `https://api.the-odds-api.com/v4/sports/${sports}/odds?${params.toString()}`;
}

function getConfiguredOddsApiKeys() {
  const primary = process.env.ODDSAPI_IO_KEY?.trim() || process.env.ODDS_API_KEY?.trim() || "";
  const secondary = process.env.ODDSAPI_IO_KEY_2?.trim() || "";
  const csv = process.env.ODDS_API_KEYS?.trim() || "";

  const csvKeys = csv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const merged = [primary, secondary, ...csvKeys].filter(Boolean);
  return Array.from(new Set(merged));
}

function getPrimaryOddsApiKey() {
  return getConfiguredOddsApiKeys()[0] ?? null;
}

export const oddsApiIoBookFeedProvider: BookFeedProvider = {
  key: "oddsapi-io",
  label: "OddsAPI.io feed",
  sportsbookKey: "oddsapi-io",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  polling: {
    ttlMs: 60_000,
    jitterMs: 10_000,
    workerOnly: true,
    backoff: {
      baseMs: 120_000,
      maxMs: 30 * 60_000,
      multiplier: 2
    }
  },
  plan: {
    pregame: [
      { label: "far", startsBeforeEventMs: null, endsBeforeEventMs: 12 * 60 * 60_000, intervalMs: 15 * 60_000 },
      { label: "near", startsBeforeEventMs: 12 * 60 * 60_000, endsBeforeEventMs: 2 * 60 * 60_000, intervalMs: 5 * 60_000 },
      { label: "tight", startsBeforeEventMs: 2 * 60 * 60_000, endsBeforeEventMs: 0, intervalMs: 60_000 }
    ],
    live: []
  },
  describe() {
    const keyCount = getConfiguredOddsApiKeys().length;
    if (!keyCount) {
      return "OddsAPI.io feed (not configured - set ODDSAPI_IO_KEY or ODDS_API_KEY)";
    }
    return `OddsAPI.io feed (${keyCount} key${keyCount === 1 ? "" : "s"} configured)`;
  },
  async fetchFeed(args) {
    const selectedApiKey = getPrimaryOddsApiKey();
    if (!selectedApiKey) {
      return {
        ok: false,
        providerKey: "oddsapi-io",
        sportsbookKey: "oddsapi-io",
        fetchedAt: new Date().toISOString(),
        status: "ERROR",
        reason: "ODDSAPI_IO_KEY/ODDS_API_KEY not configured",
        errorCode: "MISSING_API_KEY"
      };
    }

    const url = buildOddsApiUrl(args.leagues ?? []);
    if (!url) {
      return {
        ok: false,
        providerKey: "oddsapi-io",
        sportsbookKey: "oddsapi-io",
        fetchedAt: new Date().toISOString(),
        status: "ERROR",
        reason: "No supported sports in request",
        errorCode: "NO_SPORTS"
      };
    }

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "SharkEdge/1.0"
        },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000)
      });

      if (!response.ok) {
        return {
          ok: false,
          providerKey: "oddsapi-io",
          sportsbookKey: "oddsapi-io",
          fetchedAt: new Date().toISOString(),
          status: "ERROR",
          reason: `OddsAPI.io returned ${response.status}: ${response.statusText}`,
          retryAfterMs: Number(response.headers.get("retry-after")) * 1000 || null,
          errorCode: `HTTP_${response.status}`
        };
      }

      const payload = await response.json();
      return {
        ok: true,
        providerKey: "oddsapi-io",
        sportsbookKey: "oddsapi-io",
        fetchedAt: new Date().toISOString(),
        sourceUrl: url.replace(selectedApiKey, "***"),
        cacheTtlMs: 60_000,
        etag: response.headers.get("etag"),
        payload
      };
    } catch (error) {
      return {
        ok: false,
        providerKey: "oddsapi-io",
        sportsbookKey: "oddsapi-io",
        fetchedAt: new Date().toISOString(),
        status: "ERROR",
        reason: error instanceof Error ? error.message : "OddsAPI.io request failed",
        errorCode: "ODDSAPI_FETCH_FAILED"
      };
    }
  }
};
