import type { LeagueKey } from "@/lib/types/domain";

import { getCurrentOddsBackendBaseUrl } from "./backend-url";
import type { BookFeedProvider, BookFeedProviderKey } from "./book-feed-provider-types";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "MLB", "NHL", "NFL", "NCAAF"];

const oddsharvesterBookFeedProvider: BookFeedProvider = {
  key: "oddsharvester",
  label: "OddsHarvester feed",
  sportsbookKey: "oddsharvester",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  polling: {
    ttlMs: 60_000,
    jitterMs: 10_000,
    workerOnly: true,
    backoff: {
      baseMs: 60_000,
      maxMs: 600_000,
      multiplier: 2
    }
  },
  plan: {
    pregame: [
      {
        label: "default",
        startsBeforeEventMs: null,
        endsBeforeEventMs: 0,
        intervalMs: 60_000
      }
    ],
    live: []
  },
  describe() {
    return "Primary OddsHarvester feed";
  },
  async fetchFeed(args) {
    const base = `${getCurrentOddsBackendBaseUrl()}/api/odds/board`;
    const league = args.leagues?.[0];
    const url = league ? `${base}?league=${encodeURIComponent(league)}` : base;
    const fetchedAt = new Date().toISOString();

    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15_000)
      });

      if (!response.ok) {
        return {
          ok: false,
          providerKey: "oddsharvester",
          sportsbookKey: "oddsharvester",
          fetchedAt,
          status: "ERROR",
          reason: `HTTP ${response.status}`
        };
      }

      const json = await response.json() as {
        sports?: Array<{
          key?: string;
          games?: Array<{
            id?: string;
            home_team?: string;
            away_team?: string;
            commence_time?: string;
            bookmakers?: Array<{
              title?: string;
              last_update?: string;
              markets?: {
                moneyline?: Array<{ name?: string; price?: number }>;
                spread?: Array<{ name?: string; price?: number; point?: number }>;
                total?: Array<{ name?: string; price?: number; point?: number }>;
              };
            }>;
          }>;
        }>;
      };

      const events = (json.sports ?? []).flatMap((sport) =>
        (sport.games ?? []).map((game) => ({
          sport: sport.key ?? "unknown",
          league: sport.key ?? "unknown",
          homeTeam: game.home_team ?? "Home",
          awayTeam: game.away_team ?? "Away",
          commenceTime: game.commence_time ?? fetchedAt,
          eventKey: game.id ?? `${sport.key ?? "sport"}:${game.away_team ?? "away"}:${game.home_team ?? "home"}`,
          lines: (game.bookmakers ?? []).map((book) => ({
            book: book.title ?? "OddsHarvester",
            fetchedAt: book.last_update ?? fetchedAt,
            markets: [
              ...(book.markets?.moneyline ?? []).map((o) => ({
                marketType: "moneyline",
                selection: o.name ?? "Market",
                oddsAmerican: o.price ?? null
              })),
              ...(book.markets?.spread ?? []).map((o) => ({
                marketType: "spread",
                selection: o.name ?? "Market",
                oddsAmerican: o.price ?? null,
                line: o.point ?? null
              })),
              ...(book.markets?.total ?? []).map((o) => ({
                marketType: "total",
                selection: o.name ?? "Market",
                oddsAmerican: o.price ?? null,
                line: o.point ?? null
              }))
            ]
          }))
        }))
      );

      return {
        ok: true,
        providerKey: "oddsharvester",
        sportsbookKey: "oddsharvester",
        fetchedAt,
        sourceUrl: url,
        cacheTtlMs: 60_000,
        payload: { events }
      };
    } catch (error) {
      return {
        ok: false,
        providerKey: "oddsharvester",
        sportsbookKey: "oddsharvester",
        fetchedAt,
        status: "ERROR",
        reason: error instanceof Error ? error.message : "fetch failed"
      };
    }
  }
};

const BOOK_FEED_PROVIDERS: BookFeedProvider[] = [oddsharvesterBookFeedProvider];

export function getBookFeedProviders() {
  return BOOK_FEED_PROVIDERS;
}

export function getBookFeedProvider(key: BookFeedProviderKey) {
  return BOOK_FEED_PROVIDERS.find((provider) => provider.key === key) ?? null;
}

export function getBookFeedProvidersForLeague(leagueKey: LeagueKey) {
  return BOOK_FEED_PROVIDERS.filter((provider) => provider.supportsLeague(leagueKey));
}

export function getBookFeedLabelsForLeague(leagueKey: LeagueKey) {
  return getBookFeedProvidersForLeague(leagueKey).map((provider) => provider.label);
}
