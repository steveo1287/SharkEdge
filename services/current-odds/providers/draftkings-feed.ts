import type { LeagueKey } from "@/lib/types/domain";

import type { BookFeedProvider } from "../book-feed-provider-types";
import {
  getCurrentOddsBackendBaseUrl,
  hasCurrentOddsBackendBaseUrl
} from "../backend-url";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "MLB", "NHL", "NFL", "NCAAF"];

function resolveDraftKingsFeedUrl() {
  const explicit = process.env.SHARKEDGE_DRAFTKINGS_FEED_URL?.trim();
  if (explicit) {
    return explicit;
  }

  if (!hasCurrentOddsBackendBaseUrl()) {
    return null;
  }

  return `${getCurrentOddsBackendBaseUrl()}/api/book-feeds/draftkings`;
}

function buildDraftKingsFeedUrl(leagues: LeagueKey[]) {
  const baseUrl = resolveDraftKingsFeedUrl();
  if (!baseUrl) {
    return null;
  }

  const url = new URL(baseUrl);
  if (leagues.length) {
    url.searchParams.set("leagues", leagues.join(","));
  }
  return url.toString();
}

export const draftKingsBookFeedProvider: BookFeedProvider = {
  key: "draftkings",
  label: "DraftKings book feed",
  sportsbookKey: "draftkings",
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
    return process.env.SHARKEDGE_DRAFTKINGS_FEED_URL?.trim()
      ? "Worker-only DraftKings feed adapter. Uses an externally configured feed endpoint and never runs in page requests."
      : hasCurrentOddsBackendBaseUrl()
        ? "Worker-only DraftKings feed adapter. Uses the explicitly configured backend /api/book-feeds/draftkings endpoint when direct feed wiring is not provided."
        : "Worker-only DraftKings feed adapter. Disabled until SHARKEDGE_DRAFTKINGS_FEED_URL or SHARKEDGE_BACKEND_URL is set.";
  },
  async fetchFeed(args) {
    const url = buildDraftKingsFeedUrl(args.leagues ?? []);

    if (!url) {
      return {
        ok: false,
        providerKey: "draftkings",
        sportsbookKey: "draftkings",
        fetchedAt: new Date().toISOString(),
        status: "NOT_CONFIGURED",
        reason: "SHARKEDGE_DRAFTKINGS_FEED_URL or SHARKEDGE_BACKEND_URL must be set before this worker feed can run.",
        errorCode: "BOOK_FEED_NOT_CONFIGURED"
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
          providerKey: "draftkings",
          sportsbookKey: "draftkings",
          fetchedAt: new Date().toISOString(),
          status: "ERROR",
          reason: `DraftKings feed returned ${response.status}.`,
          retryAfterMs: Number(response.headers.get("retry-after")) * 1000 || null,
          errorCode: `HTTP_${response.status}`
        };
      }

      const payload = await response.json();
      return {
        ok: true,
        providerKey: "draftkings",
        sportsbookKey: "draftkings",
        fetchedAt: new Date().toISOString(),
        sourceUrl: url,
        cacheTtlMs: 90_000,
        etag: response.headers.get("etag"),
        payload
      };
    } catch (error) {
      return {
        ok: false,
        providerKey: "draftkings",
        sportsbookKey: "draftkings",
        fetchedAt: new Date().toISOString(),
        status: "ERROR",
        reason: error instanceof Error ? error.message : "DraftKings feed request failed.",
        errorCode: "BOOK_FEED_FETCH_FAILED"
      };
    }
  },
};
