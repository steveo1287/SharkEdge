const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; timestamp: number }>();

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";

const ODDS_API_SPORT = {
  nba: "basketball_nba",
  ncaab: "basketball_ncaab",
  mlb: "baseball_mlb",
  nhl: "icehockey_nhl",
  nfl: "americanfootball_nfl",
  ncaaf: "americanfootball_ncaaf"
} as const;

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
  source: "the-odds-api";
  eventId: string | null;
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
  commenceTime: string | null;
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
    source: "the-odds-api" | "espn";
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

async function fetchOddsApiData(league: LeagueParam) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return new Map<string, OddsEntry>();
  }

  const sport = ODDS_API_SPORT[league];
  if (!sport) {
    return new Map<string, OddsEntry>();
  }

  const cacheKey = `oddsapi:${league}`;
  const cached = getCached<Map<string, OddsEntry>>(cacheKey);
  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    apiKey,
    regions: "us",
    markets: "h2h,spreads,totals",
    oddsFormat: "american",
    dateFormat: "iso"
  });

  const url = `${ODDS_API_BASE}/sports/${sport}/odds?${params.toString()}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 300 }
    });

    const remaining = response.headers.get("x-requests-remaining");
    const used = response.headers.get("x-requests-used");

    if (remaining) {
      console.log(`[OddsAPI] ${league} - ${remaining} requests remaining (${used ?? "?"} used)`);
    }

    if (!response.ok) {
      console.error(`[OddsAPI] ${response.status} for ${league}`);
      return new Map<string, OddsEntry>();
    }

    const events = (await response.json()) as Array<Record<string, any>>;
    const oddsMap = new Map<string, OddsEntry>();

    for (const event of events) {
      let bestSpread: OddsEntry["spread"] = null;
      let bestTotal: OddsEntry["total"] = null;
      let bestHomeML: { price: number; book: string } | null = null;
      let bestAwayML: { price: number; book: string } | null = null;
      const bookmakers: string[] = [];

      for (const book of event.bookmakers ?? []) {
        bookmakers.push(String(book.key ?? ""));

        for (const market of book.markets ?? []) {
          if (market.key === "spreads") {
            for (const outcome of market.outcomes ?? []) {
              if (outcome.name === event.home_team) {
                if (
                  bestSpread === null ||
                  Math.abs(Number(outcome.point ?? 0)) < Math.abs(bestSpread.point)
                ) {
                  bestSpread = {
                    point: Number(outcome.point),
                    price: Number(outcome.price),
                    book: String(book.key ?? ""),
                    label: `${outcome.name} ${Number(outcome.point) > 0 ? "+" : ""}${Number(outcome.point)}`
                  };
                }
              }
            }
          }

          if (market.key === "totals") {
            const over = market.outcomes?.find((outcome: Record<string, any>) => outcome.name === "Over");
            const under = market.outcomes?.find((outcome: Record<string, any>) => outcome.name === "Under");

            if (over && (bestTotal === null || Number(over.point) > bestTotal.point)) {
              bestTotal = {
                point: Number(over.point),
                overPrice: Number(over.price),
                underPrice: under?.price ? Number(under.price) : null,
                book: String(book.key ?? "")
              };
            }
          }

          if (market.key === "h2h") {
            for (const outcome of market.outcomes ?? []) {
              if (outcome.name === event.home_team) {
                if (bestHomeML === null || Number(outcome.price) > bestHomeML.price) {
                  bestHomeML = { price: Number(outcome.price), book: String(book.key ?? "") };
                }
              }

              if (outcome.name === event.away_team) {
                if (bestAwayML === null || Number(outcome.price) > bestAwayML.price) {
                  bestAwayML = { price: Number(outcome.price), book: String(book.key ?? "") };
                }
              }
            }
          }
        }
      }

      const key = normalizeMatchupKey(
        String(event.away_team ?? ""),
        String(event.home_team ?? "")
      );

      oddsMap.set(key, {
        source: "the-odds-api",
        eventId: event.id ? String(event.id) : null,
        bookmakers,
        spread: bestSpread,
        total: bestTotal,
        homeMoneyline: bestHomeML?.price ?? null,
        awayMoneyline: bestAwayML?.price ?? null,
        commenceTime: event.commence_time ? String(event.commence_time) : null
      });
    }

    setCached(cacheKey, oddsMap);
    return oddsMap;
  } catch (error) {
    console.error(
      "[OddsAPI] fetch error:",
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

  const oddsApiData = findOddsForGame(game, oddsMap);

  if (oddsApiData) {
    game.oddsEventId = oddsApiData.eventId;
    game.odds = {
      source: "the-odds-api",
      bookmakers: oddsApiData.bookmakers,
      spread: oddsApiData.spread?.label ?? null,
      spreadPoint: oddsApiData.spread?.point ?? null,
      spreadPrice: oddsApiData.spread?.price ?? null,
      overUnder: oddsApiData.total?.point ?? null,
      overPrice: oddsApiData.total?.overPrice ?? null,
      underPrice: oddsApiData.total?.underPrice ?? null,
      homeMoneyline: oddsApiData.homeMoneyline,
      awayMoneyline: oddsApiData.awayMoneyline
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
      fetchOddsApiData(league)
    ]);

    const events = espnData.events ?? [];
    const games = events.map((event) => normalizeGame(event, league, oddsMap));

    return Response.json({
      league,
      date: date || "today",
      count: games.length,
      gamesWithOdds: games.filter((game) => game.odds !== null).length,
      oddsSource: oddsMap.size > 0 ? "the-odds-api+espn-fallback" : "espn-only",
      oddsApiActive: oddsMap.size > 0,
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
