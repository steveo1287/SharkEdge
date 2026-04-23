import { loadEnvConfig } from "@next/env";
import type { LeagueKey } from "@/lib/types/domain";

import type {
  CurrentOddsBoardResponse,
  CurrentOddsBookmaker,
  CurrentOddsGame,
  CurrentOddsOffer,
  CurrentOddsProvider,
  CurrentOddsSport
} from "./provider-types";

declare global {
  var sharkedgeOddsApiEnvLoaded: boolean | undefined;
}

if (!global.sharkedgeOddsApiEnvLoaded) {
  loadEnvConfig(process.cwd());
  global.sharkedgeOddsApiEnvLoaded = true;
}

const ODDS_API_BASE_URL = "https://api.the-odds-api.com/v4";
const ODDS_API_KEY = process.env.ODDS_API_KEY?.trim() || "";
const ODDS_API_TIMEOUT_MS = 6_000;
const ODDS_API_CACHE_TTL_MS = 4 * 60_000; // 4 min (conservative for free tier)

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];

const LEAGUE_TO_SPORT_KEY: Record<LeagueKey, string> = {
  NBA: "basketball_nba",
  NCAAB: "basketball_ncaab",
  MLB: "baseball_mlb",
  NHL: "icehockey_nhl",
  NFL: "americanfootball_nfl",
  NCAAF: "americanfootball_ncaaf",
  UFC: "mma_ufc",
  BOXING: "boxing_boxing"
};

type OddsAPIGame = {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    key: string;
    title: string;
    last_update: string;
    markets: Array<{
      key: string;
      last_update: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
};

type OddsAPIResponse = {
  success?: boolean;
  data?: OddsAPIGame[];
};

let cachedBoard: CurrentOddsBoardResponse | null = null;
let cacheExpiry = 0;

function buildGame(oddsGame: OddsAPIGame): CurrentOddsGame | null {
  if (!oddsGame.home_team || !oddsGame.away_team || !oddsGame.id) {
    return null;
  }

  const bookmakers: CurrentOddsBookmaker[] = [];
  const moneylineOffers: Map<string, number[]> = new Map();
  const spreadOffers: Map<string, { line: number; odds: number[] }> = new Map();
  const totalOffers: Map<string, { line: number; odds: number[] }> = new Map();

  for (const book of oddsGame.bookmakers || []) {
    const bookKey = book.key.toLowerCase();
    const bookTitle = book.title || book.key;
    const lastUpdate = book.last_update || new Date().toISOString();

    const moneylineMarket = book.markets?.find((m) => m.key === "h2h");
    const spreadMarket = book.markets?.find((m) => m.key === "spreads");
    const totalMarket = book.markets?.find((m) => m.key === "totals");

    const bookmakerOdds: CurrentOddsBookmaker = {
      key: bookKey,
      title: bookTitle,
      last_update: lastUpdate,
      markets: {
        moneyline: [],
        spread: [],
        total: []
      }
    };

    if (moneylineMarket?.outcomes) {
      for (const outcome of moneylineMarket.outcomes) {
        const name = outcome.name.toLowerCase();
        if (name.includes(oddsGame.home_team.toLowerCase())) {
          bookmakerOdds.markets.moneyline.push({
            name: "Home",
            price: outcome.price,
            point: null
          });
          if (!moneylineOffers.has("home")) moneylineOffers.set("home", []);
          moneylineOffers.get("home")?.push(outcome.price);
        } else if (name.includes(oddsGame.away_team.toLowerCase())) {
          bookmakerOdds.markets.moneyline.push({
            name: "Away",
            price: outcome.price,
            point: null
          });
          if (!moneylineOffers.has("away")) moneylineOffers.set("away", []);
          moneylineOffers.get("away")?.push(outcome.price);
        }
      }
    }

    if (spreadMarket?.outcomes) {
      for (const outcome of spreadMarket.outcomes) {
        const name = outcome.name.toLowerCase();
        const line = outcome.point ?? 0;
        if (name.includes(oddsGame.home_team.toLowerCase())) {
          bookmakerOdds.markets.spread.push({
            name: "Home",
            price: outcome.price,
            point: line
          });
          const key = `home_${line}`;
          if (!spreadOffers.has(key)) spreadOffers.set(key, { line, odds: [] });
          spreadOffers.get(key)?.odds.push(outcome.price);
        } else if (name.includes(oddsGame.away_team.toLowerCase())) {
          bookmakerOdds.markets.spread.push({
            name: "Away",
            price: outcome.price,
            point: line
          });
          const key = `away_${line}`;
          if (!spreadOffers.has(key)) spreadOffers.set(key, { line, odds: [] });
          spreadOffers.get(key)?.odds.push(outcome.price);
        }
      }
    }

    if (totalMarket?.outcomes) {
      for (const outcome of totalMarket.outcomes) {
        const name = outcome.name.toLowerCase();
        const line = outcome.point ?? 0;
        if (name.includes("over")) {
          bookmakerOdds.markets.total.push({
            name: "Over",
            price: outcome.price,
            point: line
          });
          const key = `over_${line}`;
          if (!totalOffers.has(key)) totalOffers.set(key, { line, odds: [] });
          totalOffers.get(key)?.odds.push(outcome.price);
        } else if (name.includes("under")) {
          bookmakerOdds.markets.total.push({
            name: "Under",
            price: outcome.price,
            point: line
          });
          const key = `under_${line}`;
          if (!totalOffers.has(key)) totalOffers.set(key, { line, odds: [] });
          totalOffers.get(key)?.odds.push(outcome.price);
        }
      }
    }

    if (
      bookmakerOdds.markets.moneyline.length > 0 ||
      bookmakerOdds.markets.spread.length > 0 ||
      bookmakerOdds.markets.total.length > 0
    ) {
      bookmakers.push(bookmakerOdds);
    }
  }

  const marketStats = {
    moneyline: buildOffers(moneylineOffers),
    spread: buildSpreadOffers(spreadOffers),
    total: buildTotalOffers(totalOffers)
  };

  return {
    id: oddsGame.id,
    commence_time: oddsGame.commence_time,
    home_team: oddsGame.home_team,
    away_team: oddsGame.away_team,
    bookmakers_available: bookmakers.length,
    bookmakers,
    market_stats: marketStats
  };
}

function buildOffers(offers: Map<string, number[]>): CurrentOddsOffer[] {
  return Array.from(offers.entries()).map(([name, prices]) => {
    const sorted = prices.sort((a, b) => b - a);
    return {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      best_price: sorted[0] || null,
      best_bookmakers: [],
      average_price: sorted.length > 0 ? sorted.reduce((a, b) => a + b) / sorted.length : null,
      book_count: prices.length,
      consensus_point: null,
      point_frequency: 0
    };
  });
}

function buildSpreadOffers(
  offers: Map<string, { line: number; odds: number[] }>
): CurrentOddsOffer[] {
  return Array.from(offers.entries()).map(([name, data]) => {
    const sorted = data.odds.sort((a, b) => b - a);
    const [side] = name.split("_");
    return {
      name: `${side.charAt(0).toUpperCase() + side.slice(1)} (${data.line > 0 ? "+" : ""}${data.line})`,
      best_price: sorted[0] || null,
      best_bookmakers: [],
      average_price: sorted.length > 0 ? sorted.reduce((a, b) => a + b) / sorted.length : null,
      book_count: sorted.length,
      consensus_point: data.line,
      point_frequency: sorted.length
    };
  });
}

function buildTotalOffers(
  offers: Map<string, { line: number; odds: number[] }>
): CurrentOddsOffer[] {
  return Array.from(offers.entries()).map(([name, data]) => {
    const sorted = data.odds.sort((a, b) => b - a);
    const [side] = name.split("_");
    return {
      name: `${side.charAt(0).toUpperCase() + side.slice(1)} ${data.line}`,
      best_price: sorted[0] || null,
      best_bookmakers: [],
      average_price: sorted.length > 0 ? sorted.reduce((a, b) => a + b) / sorted.length : null,
      book_count: sorted.length,
      consensus_point: data.line,
      point_frequency: sorted.length
    };
  });
}

async function fetchOddsAPIBoard(): Promise<CurrentOddsBoardResponse | null> {
  if (!ODDS_API_KEY) {
    return null;
  }

  const now = Date.now();
  if (cachedBoard && now < cacheExpiry) {
    return cachedBoard;
  }

  const sportKeys = SUPPORTED_LEAGUES.map((league) => LEAGUE_TO_SPORT_KEY[league]).join(",");

  try {
    const response = await fetch(
      `${ODDS_API_BASE_URL}/sports/${sportKeys}/odds?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals`,
      { signal: AbortSignal.timeout(ODDS_API_TIMEOUT_MS) }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as OddsAPIResponse;
    if (!data.success || !data.data) {
      return null;
    }

    const sportMap: Record<string, CurrentOddsGame[]> = {};

    for (const oddsGame of data.data) {
      const league = Object.entries(LEAGUE_TO_SPORT_KEY).find(
        ([, key]) => key === oddsGame.sport_key
      )?.[0] as LeagueKey | undefined;

      if (!league) continue;

      const game = buildGame(oddsGame);
      if (!game) continue;

      if (!sportMap[league]) {
        sportMap[league] = [];
      }
      sportMap[league].push(game);
    }

    const sports: CurrentOddsSport[] = Object.entries(sportMap).map(([leagueKey, games]) => ({
      key: leagueKey.toLowerCase(),
      title: leagueKey,
      short_title: leagueKey,
      game_count: games.length,
      games
    }));

    const board: CurrentOddsBoardResponse = {
      configured: true,
      generated_at: new Date().toISOString(),
      provider: "the-odds-api",
      provider_mode: "the-odds-api",
      bookmakers: "DraftKings, FanDuel, BetMGM, and 50+ others",
      errors: [],
      sports
    };

    cachedBoard = board;
    cacheExpiry = now + ODDS_API_CACHE_TTL_MS;
    return board;
  } catch {
    return null;
  }
}

export const theOddsApiProvider: CurrentOddsProvider = {
  key: "the-odds-api",
  label: "The Odds API",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  async fetchBoard() {
    return fetchOddsAPIBoard();
  }
};
