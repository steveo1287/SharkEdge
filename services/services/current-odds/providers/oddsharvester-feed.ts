import type { LeagueKey } from "@/lib/types/domain";
import type { BookFeedProvider } from "../book-feed-provider-types";
import { getCurrentOddsBackendBaseUrl } from "../backend-url";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA","NCAAB","MLB","NHL","NFL","NCAAF"];

export const oddsharvesterBookFeedProvider: BookFeedProvider = {
  key: "oddsharvester",
  label: "OddsHarvester feed",
  sportsbookKey: "oddsharvester",

  supportsLeague(l) {
    return SUPPORTED_LEAGUES.includes(l);
  },

  polling: {
    ttlMs: 60000,
    jitterMs: 10000,
    workerOnly: true,
    backoff: { baseMs: 60000, maxMs: 600000, multiplier: 2 }
  },

  plan: {
    pregame: [
      { label: "default", startsBeforeEventMs: null, endsBeforeEventMs: 0, intervalMs: 60000 }
    ],
    live: []
  },

  describe() {
    return "OddsHarvester primary feed";
  },

  async fetchFeed(args) {
    const base = `${getCurrentOddsBackendBaseUrl()}/api/odds/board`;
    const league = args.leagues?.[0];
    const url = league ? `${base}?league=${league}` : base;

    const fetchedAt = new Date().toISOString();

    try {
      const res = await fetch(url, { cache: "no-store" });

      if (!res.ok) {
        return {
          ok: false,
          providerKey: "oddsharvester",
          sportsbookKey: "oddsharvester",
          fetchedAt,
          status: "ERROR",
          reason: `HTTP ${res.status}`
        };
      }

      const json = await res.json();

      const events = (json.sports ?? []).flatMap((sport: any) =>
        (sport.games ?? []).map((g: any) => ({
          sport: sport.key,
          league: sport.key,
          homeTeam: g.home_team,
          awayTeam: g.away_team,
          commenceTime: g.commence_time,
          eventKey: g.id,
          lines: (g.bookmakers ?? []).map((b: any) => ({
            book: b.title,
            fetchedAt: b.last_update,
            markets: [
              ...(b.markets?.moneyline ?? []).map((o: any) => ({
                marketType: "moneyline",
                selection: o.name,
                oddsAmerican: o.price
              })),
              ...(b.markets?.spread ?? []).map((o: any) => ({
                marketType: "spread",
                selection: o.name,
                oddsAmerican: o.price,
                line: o.point
              })),
              ...(b.markets?.total ?? []).map((o: any) => ({
                marketType: "total",
                selection: o.name,
                oddsAmerican: o.price,
                line: o.point
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
        cacheTtlMs: 60000,
        payload: { events }
      };

    } catch (e) {
      return {
        ok: false,
        providerKey: "oddsharvester",
        sportsbookKey: "oddsharvester",
        fetchedAt,
        status: "ERROR",
        reason: e instanceof Error ? e.message : "fetch failed"
      };
    }
  }
};