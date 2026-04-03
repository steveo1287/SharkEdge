import type { LeagueKey } from "@/lib/types/domain";

import type { BookFeedProvider } from "../book-feed-provider-types";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];
const FANDUEL_FEED_URL = process.env.SHARKEDGE_FANDUEL_FEED_URL?.trim() ?? "";

function buildFanDuelFeedUrl(leagues: LeagueKey[]) {
  const url = new URL(FANDUEL_FEED_URL);
  if (leagues.length) {
    url.searchParams.set("leagues", leagues.join(","));
  }
  return url.toString();
}

export const fanDuelBookFeedProvider: BookFeedProvider = {
  key: "fanduel",
  label: "FanDuel book feed",
  sportsbookKey: "fanduel",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  polling: {
    ttlMs: 90_000,
    jitterMs: 15_000,
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
      { label: "tight", startsBeforeEventMs: 2 * 60 * 60_000, endsBeforeEventMs: 0, intervalMs: 90_000 }
    ],
    live: []
  },
  describe() {
    return FANDUEL_FEED_URL
      ? "Worker-only FanDuel feed adapter. Uses an externally configured feed endpoint and never runs in page requests."
      : "Worker-only FanDuel feed scaffold. No request-path scraping, no page fetches, and no live integration is enabled until a verified stable feed contract is configured in-repo.";
  },
  async fetchFeed(args) {
    if (!FANDUEL_FEED_URL) {
      return {
        ok: false,
        providerKey: "fanduel",
        sportsbookKey: "fanduel",
        fetchedAt: new Date().toISOString(),
        status: "NOT_CONFIGURED",
        reason: "Set SHARKEDGE_FANDUEL_FEED_URL to enable the worker-only FanDuel feed adapter.",
        errorCode: "BOOK_FEED_NOT_CONFIGURED"
      };
    }

    const url = buildFanDuelFeedUrl(args.leagues ?? []);

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
          providerKey: "fanduel",
          sportsbookKey: "fanduel",
          fetchedAt: new Date().toISOString(),
          status: "ERROR",
          reason: `FanDuel feed returned ${response.status}.`,
          retryAfterMs: Number(response.headers.get("retry-after")) * 1000 || null,
          errorCode: `HTTP_${response.status}`
        };
      }

      const payload = await response.json();
      return {
        ok: true,
        providerKey: "fanduel",
        sportsbookKey: "fanduel",
        fetchedAt: new Date().toISOString(),
        sourceUrl: url,
        cacheTtlMs: 90_000,
        etag: response.headers.get("etag"),
        payload
      };
    } catch (error) {
      return {
        ok: false,
        providerKey: "fanduel",
        sportsbookKey: "fanduel",
        fetchedAt: new Date().toISOString(),
        status: "ERROR",
        reason: error instanceof Error ? error.message : "FanDuel feed request failed.",
        errorCode: "BOOK_FEED_FETCH_FAILED"
      };
    }
  },
};
