const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { data: unknown; timestamp: number }>();

// REMOVED: OddsAPI (paid/rate-limited service)
// Using SportsDataverse and OddsHarvester for odds data instead


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

// DEPRECATED: OddsAPI integration removed (paid/rate-limited service)
// Use SportsDataverse or OddsHarvester for odds data instead
async function fetchOddsApiData(_league: LeagueParam) {
  console.log("[Odds Data] Using ESPN consensus odds only (OddsAPI removed in favor of open-source sources)");
  return new Map<string, OddsEntry>();
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
