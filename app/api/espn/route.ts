const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; timestamp: number }>();

function getBackendUrl() {
  const explicit = process.env.SHARKEDGE_BACKEND_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  return "https://shark-odds-1.onrender.com";
}

const LEAGUE_MAP = {
  nba: "basketball/nba",
  ncaab: "basketball/mens-college-basketball",
  mlb: "baseball/mlb",
  nhl: "hockey/nhl",
  nfl: "football/nfl",
  ncaaf: "football/college-football"
} as const;

type LeagueParam = keyof typeof LEAGUE_MAP;

type OddsEntry = {
  source: "oddsharvester";
  bookmakers: string[];
  spread: {
    point: number;
    price: number;
    book: string;
    label: string;
  } | null;
  total: {
    point: number;
    overPrice: number;
    underPrice: number | null;
    book: string;
  } | null;
  homeMoneyline: number | null;
  awayMoneyline: number | null;
};

type NormalizedGame = {
  id: string | null;
  oddsEventId: string | null;
  league: LeagueParam;
  name: string | null;
  shortName: string | null;
  date: string | null;
  status: {
    state: string | null;
    detail: string | null;
    completed: boolean;
  };
  home: {
    id: string | null;
    name: string | null;
    abbreviation: string | null;
    logo: string | null;
    score: string | null;
    record: string | null;
    winner: boolean | null;
  };
  away: {
    id: string | null;
    name: string | null;
    abbreviation: string | null;
    logo: string | null;
    score: string | null;
    record: string | null;
    winner: boolean | null;
  };
  venue: string | null;
  broadcast: string | null;
  odds: {
    source: "oddsharvester" | "espn";
    bookmakers: string[];
    spread: string | null;
    spreadPoint: number | null;
    spreadPrice: number | null;
    overUnder: number | null;
    overPrice: number | null;
    underPrice: number | null;
    homeMoneyline: number | null;
    awayMoneyline: number | null;
  } | null;
};

function getCached<T>(key: string) {
  const entry = cache.get(key) as { data: T; timestamp: number } | undefined;
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }

  return entry.data;
}

function setCached<T>(key: string, data: T) {
  cache.set(key, { data, timestamp: Date.now() });
}

async function espnFetch<T>(url: string): Promise<T> {
  const cached = getCached<T>(url);
  if (cached) {
    return cached;
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 300 }
  });

  if (!response.ok) {
    throw new Error(`ESPN fetch failed: ${response.status} ${url}`);
  }

  const data = (await response.json()) as T;
  setCached(url, data);
  return data;
}

async function fetchOddsHarvesterData(): Promise<Map<string, OddsEntry>> {
  const cacheKey = "oddsharvester:board";
  const cached = getCached<Map<string, OddsEntry>>(cacheKey);
  if (cached) {
    return cached;
  }

  const backendUrl = getBackendUrl();
  const url = `${backendUrl}/api/odds/board`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000)
    });

    if (!response.ok) {
      console.error(`[OddsHarvester] ${response.status} from ${url}`);
      return new Map<string, OddsEntry>();
    }

    const data = (await response.json()) as Record<string, any>;

    if (!data.sports || !Array.isArray(data.sports)) {
      console.error("[OddsHarvester] Invalid response structure");
      return new Map<string, OddsEntry>();
    }

    const oddsMap = new Map<string, OddsEntry>();

    for (const sport of data.sports) {
      for (const game of sport.games ?? []) {
        let bestSpread: OddsEntry["spread"] = null;
        let bestTotal: OddsEntry["total"] = null;
        let bestHomeML: { price: number; book: string } | null = null;
        let bestAwayML: { price: number; book: string } | null = null;
        const bookmakers = new Set<string>();

        for (const book of game.books ?? []) {
          bookmakers.add(String(book.sportsbook?.name ?? book.name ?? ""));

          const spread = book.spread?.spread;
          const spreadPrice = book.spread?.american;
          if (spread !== null && spread !== undefined && spreadPrice !== null && spreadPrice !== undefined) {
            if (bestSpread === null || Math.abs(spread) < Math.abs(bestSpread.point)) {
              bestSpread = {
                point: spread,
                price: spreadPrice,
                book: String(book.sportsbook?.name ?? book.name ?? ""),
                label: `${spread > 0 ? "+" : ""}${spread}`
              };
            }
          }

          const total = book.total?.total;
          const overPrice = book.total?.overAmerican;
          const underPrice = book.total?.underAmerican;
          if (total !== null && total !== undefined && overPrice !== null && overPrice !== undefined) {
            if (bestTotal === null || total > bestTotal.point) {
              bestTotal = {
                point: total,
                overPrice: overPrice,
                underPrice: underPrice ?? null,
                book: String(book.sportsbook?.name ?? book.name ?? "")
              };
            }
          }

          const homeML = book.moneyline?.home;
          if (homeML !== null && homeML !== undefined) {
            if (bestHomeML === null || homeML > bestHomeML.price) {
              bestHomeML = { price: homeML, book: String(book.sportsbook?.name ?? book.name ?? "") };
            }
          }

          const awayML = book.moneyline?.away;
          if (awayML !== null && awayML !== undefined) {
            if (bestAwayML === null || awayML > bestAwayML.price) {
              bestAwayML = { price: awayML, book: String(book.sportsbook?.name ?? book.name ?? "") };
            }
          }
        }

        const awayTeam = game.away_team ?? game.awayTeam ?? "";
        const homeTeam = game.home_team ?? game.homeTeam ?? "";

        const key = normalizeMatchupKey(String(awayTeam), String(homeTeam));

        oddsMap.set(key, {
          source: "oddsharvester",
          bookmakers: Array.from(bookmakers),
          spread: bestSpread,
          total: bestTotal,
          homeMoneyline: bestHomeML?.price ?? null,
          awayMoneyline: bestAwayML?.price ?? null
        });
      }
    }

    setCached(cacheKey, oddsMap);
    console.log(`[OddsHarvester] Loaded ${oddsMap.size} games from backend`);
    return oddsMap;
  } catch (error) {
    console.error(
      "[OddsHarvester] fetch error:",
      error instanceof Error ? error.message : String(error)
    );
    return new Map<string, OddsEntry>();
  }
}

function normalizeTeamName(name = "") {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMatchupKey(away: string, home: string) {
  return `${normalizeTeamName(away)}__${normalizeTeamName(home)}`;
}

function findOddsForGame(
  game: Pick<NormalizedGame, "home" | "away">,
  oddsMap: Map<string, OddsEntry>
) {
  if (oddsMap.size === 0) {
    return null;
  }

  const homeNorm = normalizeTeamName(game.home.name ?? "");
  const awayNorm = normalizeTeamName(game.away.name ?? "");

  const exactKey = `${awayNorm}__${homeNorm}`;
  if (oddsMap.has(exactKey)) {
    return oddsMap.get(exactKey) ?? null;
  }

  for (const [key, odds] of oddsMap.entries()) {
    const [keyAway, keyHome] = key.split("__");
    const homeLastWord = homeNorm.split(" ").pop() ?? "";
    const awayLastWord = awayNorm.split(" ").pop() ?? "";

    const homeMatch =
      keyHome?.includes(homeLastWord) ||
      homeNorm.includes(keyHome?.split(" ").pop() ?? "");

    const awayMatch =
      keyAway?.includes(awayLastWord) ||
      awayNorm.includes(keyAway?.split(" ").pop() ?? "");

    if (homeMatch && awayMatch) {
      return odds;
    }
  }

  return null;
}

function normalizeGame(
  event: Record<string, any>,
  league: LeagueParam,
  oddsMap: Map<string, OddsEntry>
): NormalizedGame {
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((competitor: Record<string, any>) => competitor.homeAway === "home");
  const away = competitors.find((competitor: Record<string, any>) => competitor.homeAway === "away");
  const espnOdds = competition?.odds?.[0];

  const game: NormalizedGame = {
    id: event.id ? String(event.id) : null,
    oddsEventId: null,
    league,
    name: event.name ? String(event.name) : null,
    shortName: event.shortName ? String(event.shortName) : null,
    date: event.date ? String(event.date) : null,
    status: {
      state: event.status?.type?.state ? String(event.status.type.state) : null,
      detail: event.status?.type?.detail ? String(event.status.type.detail) : null,
      completed: Boolean(event.status?.type?.completed ?? false)
    },
    home: {
      id: home?.team?.id ? String(home.team.id) : null,
      name: home?.team?.displayName ? String(home.team.displayName) : null,
      abbreviation: home?.team?.abbreviation ? String(home.team.abbreviation) : null,
      logo: home?.team?.logo ? String(home.team.logo) : null,
      score: home?.score ? String(home.score) : null,
      record: home?.records?.[0]?.summary ? String(home.records[0].summary) : null,
      winner: typeof home?.winner === "boolean" ? home.winner : null
    },
    away: {
      id: away?.team?.id ? String(away.team.id) : null,
      name: away?.team?.displayName ? String(away.team.displayName) : null,
      abbreviation: away?.team?.abbreviation ? String(away.team.abbreviation) : null,
      logo: away?.team?.logo ? String(away.team.logo) : null,
      score: away?.score ? String(away.score) : null,
      record: away?.records?.[0]?.summary ? String(away.records[0].summary) : null,
      winner: typeof away?.winner === "boolean" ? away.winner : null
    },
    venue: competition?.venue?.fullName ? String(competition.venue.fullName) : null,
    broadcast: competition?.broadcasts?.[0]?.names?.[0]
      ? String(competition.broadcasts[0].names[0])
      : null,
    odds: null
  };

  const oddsHarvesterData = findOddsForGame(game, oddsMap);

  if (oddsHarvesterData) {
    game.odds = {
      source: "oddsharvester",
      bookmakers: oddsHarvesterData.bookmakers,
      spread: oddsHarvesterData.spread?.label ?? null,
      spreadPoint: oddsHarvesterData.spread?.point ?? null,
      spreadPrice: oddsHarvesterData.spread?.price ?? null,
      overUnder: oddsHarvesterData.total?.point ?? null,
      overPrice: oddsHarvesterData.total?.overPrice ?? null,
      underPrice: oddsHarvesterData.total?.underPrice ?? null,
      homeMoneyline: oddsHarvesterData.homeMoneyline,
      awayMoneyline: oddsHarvesterData.awayMoneyline
    };
  } else if (espnOdds) {
    game.odds = {
      source: "espn",
      bookmakers: ["ESPN Consensus"],
      spread: espnOdds.details ? String(espnOdds.details) : null,
      spreadPoint: null,
      spreadPrice: null,
      overUnder: typeof espnOdds.overUnder === "number" ? espnOdds.overUnder : null,
      overPrice: null,
      underPrice: null,
      homeMoneyline:
        typeof espnOdds.homeTeamOdds?.moneyLine === "number"
          ? espnOdds.homeTeamOdds.moneyLine
          : null,
      awayMoneyline:
        typeof espnOdds.awayTeamOdds?.moneyLine === "number"
          ? espnOdds.awayTeamOdds.moneyLine
          : null
    };
  }

  return game;
}

// TODO: Wire this route into the main live board service if we decide to shift
// scoreboard aggregation from the separate Python backend into Vercel.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const requestedLeague = (searchParams.get("league") ?? "nba").toLowerCase();
  const date = searchParams.get("date") ?? "";

  if (!(requestedLeague in LEAGUE_MAP)) {
    return Response.json(
      { error: `Unknown league: ${requestedLeague}` },
      { status: 400 }
    );
  }

  const league = requestedLeague as LeagueParam;
  const sport = LEAGUE_MAP[league];
  const dateParam = date ? `&dates=${date}` : "";
  const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/scoreboard?limit=50${dateParam}`;

  try {
    const [espnData, oddsMap] = await Promise.all([
      espnFetch<{ events?: Array<Record<string, any>> }>(espnUrl),
      fetchOddsHarvesterData()
    ]);

    const events = espnData.events ?? [];
    const games = events.map((event) => normalizeGame(event, league, oddsMap));

    return Response.json({
      league,
      date: date || "today",
      count: games.length,
      gamesWithOdds: games.filter((game) => game.odds !== null).length,
      oddsSource: oddsMap.size > 0 ? "oddsharvester+espn-fallback" : "espn-only",
      oddsHarvesterActive: oddsMap.size > 0,
      games,
      fetchedAt: new Date().toISOString()
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[ESPN API]", detail);

    return Response.json(
      { error: "Failed to fetch data", detail },
      { status: 502 }
    );
  }
}
