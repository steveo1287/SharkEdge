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
  var sharkedgePinnacleEnvLoaded: boolean | undefined;
}

if (!global.sharkedgePinnacleEnvLoaded) {
  loadEnvConfig(process.cwd());
  global.sharkedgePinnacleEnvLoaded = true;
}

const PINNACLE_BASE_URL = "https://api.pinnacle.com/v3";
const PINNACLE_TIMEOUT_MS = 8_000;
const PINNACLE_CACHE_TTL_MS = 2 * 60_000; // 2 min (Pinnacle updates frequently)

const SUPPORTED_LEAGUES: LeagueKey[] = ["NFL", "NBA", "MLB", "NHL", "NCAAF", "UFC"];

type PinnacleLeagueId = 1 | 4 | 6 | 12 | 15 | 16 | 99;

const LEAGUE_TO_PINNACLE_ID: Record<LeagueKey, PinnacleLeagueId> = {
  NFL: 1,
  NCAAF: 15,
  NBA: 4,
  MLB: 12,
  NHL: 6,
  UFC: 99 as PinnacleLeagueId,
  BOXING: 97 as PinnacleLeagueId
};

type PinnacleEvent = {
  id: number;
  eventId: number;
  parentId?: number;
  name: string;
  leagueId: PinnacleLeagueId;
  isLive: boolean;
  statusId?: number;
  eventDate?: string;
};

type PinnacleOdd = {
  oddsId: number;
  eventId: number;
  contestantId: number;
  oddsType: number;
  price: number;
  type?: string;
  handicap?: number;
};

type PinnacleOddsResponse = {
  events?: PinnacleEvent[];
  odds?: PinnacleOdd[];
};

let cachedBoard: CurrentOddsBoardResponse | null = null;
let cacheExpiry = 0;

function buildGame(
  eventId: number,
  name: string,
  odds: PinnacleOdd[],
  leagueId: PinnacleLeagueId
): CurrentOddsGame | null {
  const [homeTeam, awayTeam] = name.split(" @ ").map((t) => t.trim());

  if (!homeTeam || !awayTeam) {
    return null;
  }

  const moneylineOdds = odds.filter(
    (o) =>
      o.eventId === eventId &&
      (o.oddsType === 1 || o.type === "1x2")
  );
  const spreadOdds = odds.filter(
    (o) =>
      o.eventId === eventId &&
      (o.oddsType === 2 || o.type === "handicap")
  );
  const totalOdds = odds.filter(
    (o) =>
      o.eventId === eventId &&
      (o.oddsType === 3 || o.type === "over_under")
  );

  const bookmakers: CurrentOddsBookmaker[] = [];

  if (moneylineOdds.length > 0) {
    const bookmaker: CurrentOddsBookmaker = {
      key: "pinnacle",
      title: "Pinnacle",
      markets: {
        moneyline: [],
        spread: [],
        total: []
      }
    };

    const homeMoneyline = moneylineOdds.find((o) => o.contestantId === 1);
    const awayMoneyline = moneylineOdds.find((o) => o.contestantId === 2);

    if (homeMoneyline) {
      bookmaker.markets.moneyline.push({
        name: "Home",
        price: homeMoneyline.price,
        point: null
      });
    }

    if (awayMoneyline) {
      bookmaker.markets.moneyline.push({
        name: "Away",
        price: awayMoneyline.price,
        point: null
      });
    }

    if (spreadOdds.length > 0) {
      const spreadLines = new Map<number, { home: number | null; away: number | null }>();

      for (const odd of spreadOdds) {
        const line = odd.handicap ?? 0;
        if (!spreadLines.has(line)) {
          spreadLines.set(line, { home: null, away: null });
        }
        const entry = spreadLines.get(line)!;
        if (odd.contestantId === 1) entry.home = odd.price;
        else if (odd.contestantId === 2) entry.away = odd.price;
      }

      for (const [line, { home, away }] of spreadLines) {
        if (home !== null) {
          bookmaker.markets.spread.push({
            name: `Home ${line > 0 ? "+" : ""}${line}`,
            price: home,
            point: line
          });
        }
        if (away !== null) {
          bookmaker.markets.spread.push({
            name: `Away ${line > 0 ? "+" : ""}${line}`,
            price: away,
            point: -line
          });
        }
      }
    }

    if (totalOdds.length > 0) {
      const totalLines = new Map<number, { over: number | null; under: number | null }>();

      for (const odd of totalOdds) {
        const line = odd.handicap ?? 0;
        if (!totalLines.has(line)) {
          totalLines.set(line, { over: null, under: null });
        }
        const entry = totalLines.get(line)!;
        if (odd.contestantId === 1) entry.over = odd.price;
        else if (odd.contestantId === 2) entry.under = odd.price;
      }

      for (const [line, { over, under }] of totalLines) {
        if (over !== null) {
          bookmaker.markets.total.push({
            name: `Over ${line}`,
            price: over,
            point: line
          });
        }
        if (under !== null) {
          bookmaker.markets.total.push({
            name: `Under ${line}`,
            price: under,
            point: line
          });
        }
      }
    }

    if (bookmaker.markets.moneyline.length > 0) {
      bookmakers.push(bookmaker);
    }
  }

  return {
    id: eventId.toString(),
    commence_time: new Date().toISOString(),
    home_team: homeTeam,
    away_team: awayTeam,
    bookmakers_available: bookmakers.length,
    bookmakers,
    market_stats: {
      moneyline: [],
      spread: [],
      total: []
    }
  };
}

async function fetchPinnacleBoard(): Promise<CurrentOddsBoardResponse | null> {
  const now = Date.now();
  if (cachedBoard && now < cacheExpiry) {
    return cachedBoard;
  }

  try {
    const leagueIds = SUPPORTED_LEAGUES.map((league) => LEAGUE_TO_PINNACLE_ID[league]).join(",");

    const response = await fetch(
      `${PINNACLE_BASE_URL}/fixtures?leagueIds=${leagueIds}&isLive=true`,
      { signal: AbortSignal.timeout(PINNACLE_TIMEOUT_MS) }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as PinnacleOddsResponse;

    if (!data.events) {
      return null;
    }

    const oddsResponse = await fetch(
      `${PINNACLE_BASE_URL}/odds?leagueIds=${leagueIds}`,
      { signal: AbortSignal.timeout(PINNACLE_TIMEOUT_MS) }
    );

    if (!oddsResponse.ok) {
      return null;
    }

    const oddsData = (await oddsResponse.json()) as PinnacleOddsResponse;
    const odds = oddsData.odds || [];

    const sportMap: Record<string, CurrentOddsGame[]> = {};

    for (const event of data.events) {
      const league = Object.entries(LEAGUE_TO_PINNACLE_ID).find(
        ([, id]) => id === event.leagueId
      )?.[0] as LeagueKey | undefined;

      if (!league) continue;

      const game = buildGame(event.eventId, event.name, odds, event.leagueId);
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
      provider: "pinnacle",
      provider_mode: "pinnacle",
      bookmakers: "Pinnacle (Sharp Lines)",
      errors: [],
      sports
    };

    cachedBoard = board;
    cacheExpiry = now + PINNACLE_CACHE_TTL_MS;
    return board;
  } catch {
    return null;
  }
}

export const pinnacleProvider: CurrentOddsProvider = {
  key: "pinnacle",
  label: "Pinnacle (Sharp Lines)",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  async fetchBoard() {
    return fetchPinnacleBoard();
  }
};
