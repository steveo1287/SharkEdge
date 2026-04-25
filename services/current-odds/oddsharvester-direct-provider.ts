import { execSync } from "child_process";
import type { LeagueKey } from "@/lib/types/domain";
import type { BookFeedProvider } from "./book-feed-provider-types";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "MLB", "NHL", "NFL", "NCAAF"];

// Note: OddsHarvester supports these sports. UFC and BOXING are not currently supported by oddsharvester
const sportMap: Record<LeagueKey, string> = {
  NBA: "basketball_nba",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  NFL: "americanfootball_nfl",
  NCAAF: "americanfootball_ncaaf",
  UFC: "mma_ufc",
  BOXING: "boxing"
};

function parseOddsHarvesterOutput(jsonOutput: string) {
  try {
    return JSON.parse(jsonOutput);
  } catch {
    return null;
  }
}

export const oddsharvesterDirectProvider: BookFeedProvider = {
  key: "oddsharvester",
  label: "OddsHarvester (Direct Python CLI)",
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
    return "Direct OddsHarvester integration (Python CLI)";
  },
  async fetchFeed(args) {
    const fetchedAt = new Date().toISOString();

    try {
      // Get the sports to fetch based on requested leagues
      const sports = args.leagues
        ?.map((league) => sportMap[league])
        .filter(Boolean) || Object.values(sportMap);

      if (!sports.length) {
        return {
          ok: false,
          providerKey: "oddsharvester",
          sportsbookKey: "oddsharvester",
          fetchedAt,
          status: "ERROR",
          reason: "No supported sports found"
        };
      }

      // Run OddsHarvester CLI to get upcoming games (next 7 days)
      const command = `oddsharvester upcoming --json --sports ${sports.join(",")} --days 7`;
      const output = execSync(command, { encoding: "utf-8", timeout: 30_000 });

      const data = parseOddsHarvesterOutput(output);

      if (!data) {
        return {
          ok: false,
          providerKey: "oddsharvester",
          sportsbookKey: "oddsharvester",
          fetchedAt,
          status: "ERROR",
          reason: "Failed to parse OddsHarvester output"
        };
      }

      // Transform OddsHarvester data to our format
      const events = (data.games || []).map(
        (game: {
          id?: string;
          home_team?: string;
          away_team?: string;
          commence_time?: string;
          sport_key?: string;
          bookmakers?: Array<{
            title?: string;
            last_update?: string;
            markets?: {
              h2h?: Array<{ name?: string; price?: number }>;
              spreads?: Array<{ name?: string; price?: number; point?: number }>;
              totals?: Array<{ name?: string; price?: number; point?: number }>;
            };
          }>;
        }) => ({
          sport: game.sport_key || "unknown",
          league: game.sport_key || "unknown",
          homeTeam: game.home_team || "Home",
          awayTeam: game.away_team || "Away",
          commenceTime: game.commence_time || fetchedAt,
          eventKey: game.id || `${game.sport_key}:${game.away_team}:${game.home_team}`,
          lines: (game.bookmakers || []).map((book) => ({
            book: book.title || "OddsHarvester",
            fetchedAt: book.last_update || fetchedAt,
            markets: [
              ...(book.markets?.h2h || []).map((o) => ({
                marketType: "moneyline",
                selection: o.name || "Market",
                oddsAmerican: o.price || null
              })),
              ...(book.markets?.spreads || []).map((o) => ({
                marketType: "spread",
                selection: o.name || "Market",
                oddsAmerican: o.price || null,
                line: o.point || null
              })),
              ...(book.markets?.totals || []).map((o) => ({
                marketType: "total",
                selection: o.name || "Market",
                oddsAmerican: o.price || null,
                line: o.point || null
              }))
            ]
          }))
        })
      );

      return {
        ok: true,
        providerKey: "oddsharvester",
        sportsbookKey: "oddsharvester",
        fetchedAt,
        sourceUrl: `oddsharvester cli: ${sports.join(",")}`,
        cacheTtlMs: 60_000,
        payload: { events }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        providerKey: "oddsharvester",
        sportsbookKey: "oddsharvester",
        fetchedAt,
        status: "ERROR",
        reason: `OddsHarvester CLI failed: ${message}. Make sure OddsHarvester is installed: pip install oddsharvester`
      };
    }
  }
};
