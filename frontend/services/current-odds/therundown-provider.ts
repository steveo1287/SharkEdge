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
  var sharkedgeTheRundownEnvLoaded: boolean | undefined;
}

if (!global.sharkedgeTheRundownEnvLoaded) {
  loadEnvConfig(process.cwd());
  global.sharkedgeTheRundownEnvLoaded = true;
}

const THERUNDOWN_BASE_URL =
  process.env.THERUNDOWN_BASE_URL?.trim() || "https://therundown.io/api/v2";
const THERUNDOWN_MARKET_IDS = "1,2,3";
const THERUNDOWN_OFFSET_MINUTES = "300";
const THERUNDOWN_SUPPORTED_LEAGUES: LeagueKey[] = [
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF"
];
const THERUNDOWN_PROVIDER_TIMEOUT_MS = 8_000;
// 5 minutes: safe for free-tier TheRundown — stops hammering the API on every page load
const THERUNDOWN_BOARD_CACHE_TTL_MS = 5 * 60_000;
// Shorter TTL for league-scoped UI board fetches (prevents quota burn on navigation).
const THERUNDOWN_LEAGUE_CACHE_TTL_MS = 60_000;
const THERUNDOWN_SPORT_IDS: Record<Exclude<LeagueKey, "UFC" | "BOXING">, number> = {
  NCAAF: 1,
  NFL: 2,
  MLB: 3,
  NBA: 4,
  NCAAB: 5,
  NHL: 6
};

type TheRundownPrice = {
  price: number;
};

type TheRundownLine = {
  value?: string;
  prices?: Record<string, TheRundownPrice>;
};

type TheRundownParticipant = {
  name: string;
  lines?: TheRundownLine[];
};

type TheRundownMarket = {
  market_id?: number;
  name: string;
  period_id: number;
  participants?: TheRundownParticipant[];
};

type TheRundownTeam = {
  name: string;
  mascot?: string;
  abbreviation?: string;
  is_home?: boolean;
  is_away?: boolean;
};

type TheRundownEvent = {
  event_id: string;
  event_date?: string;
  teams?: TheRundownTeam[];
  markets?: TheRundownMarket[];
};

type TheRundownEventsResponse = {
  events?: TheRundownEvent[];
};

type BookOutcomeEntry = {
  name: string;
  price: number | null;
  point: number | null;
};

type TheRundownBoardCache = {
  generatedAtMs: number;
  payload: CurrentOddsBoardResponse | null;
};

declare global {
  // eslint-disable-next-line no-var
  var sharkedgeTheRundownBoardCache: TheRundownBoardCache | undefined;
}

function getApiKey() {
  const value =
    process.env.THERUNDOWN_API_KEY?.trim() ??
    process.env.THERUNDOWN_KEY?.trim() ??
    process.env.THE_RUNDOWN_API_KEY?.trim() ??
    process.env.THE_RUNDOWN_KEY?.trim();
  return value?.length ? value : null;
}

function getAffiliateIds() {
  const raw = process.env.THERUNDOWN_AFFILIATE_IDS?.trim();
  if (!raw) {
    return [];
  }

  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchTheRundownJson<T>(path: string, params: Record<string, string>) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const url = new URL(`${THERUNDOWN_BASE_URL}${path}`);
    url.searchParams.set("key", apiKey);

    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-TheRundown-Key": apiKey
      },
      signal: AbortSignal.timeout(THERUNDOWN_PROVIDER_TIMEOUT_MS)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTheRundownJsonWithTimeout<T>(args: {
  path: string;
  params: Record<string, string>;
  timeoutMs: number;
}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return null;
  }

  try {
    const url = new URL(`${THERUNDOWN_BASE_URL}${args.path}`);
    url.searchParams.set("key", apiKey);

    for (const [key, value] of Object.entries(args.params)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-TheRundown-Key": apiKey
      },
      signal: AbortSignal.timeout(args.timeoutMs)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function parsePoint(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }
  return null;
}

function normalizeMarketName(name: string) {
  const normalized = name.toLowerCase().trim();

  // TheRundown uses stable market_ids (1/2/3) for core markets, but the `name`
  // can vary by sport or API revision ("handicap" vs "spread", "total" vs "totals").
  if (normalized === "moneyline") return "moneyline";

  if (
    normalized === "handicap" ||
    normalized === "spread" ||
    normalized === "point spread" ||
    normalized === "point_spread"
  ) {
    return "spread";
  }

  if (normalized === "total" || normalized === "totals" || normalized === "over/under") {
    return "total";
  }

  return null;
}

function normalizeMarketType(market: TheRundownMarket) {
  // Prefer the numeric identifier when present.
  if (market.market_id === 1) return "moneyline";
  if (market.market_id === 2) return "spread";
  if (market.market_id === 3) return "total";
  return normalizeMarketName(market.name);
}

function buildBookKey(affiliateId: string) {
  return `therundown_${affiliateId}`;
}

function buildBookTitle(affiliateId: string) {
  return `Affiliate ${affiliateId}`;
}

function buildTeamName(team: TheRundownTeam | undefined, fallback: string) {
  if (!team) {
    return fallback;
  }

  const name = team.name?.trim() ?? "";
  const mascot = team.mascot?.trim() ?? "";
  if (name && mascot && !name.toLowerCase().includes(mascot.toLowerCase())) {
    return `${name} ${mascot}`;
  }
  return name || fallback;
}

function buildOutcomeRows(
  participants: TheRundownParticipant[],
  affiliateIds: string[]
) {
  const rows = new Map<string, BookOutcomeEntry[]>();
  const fallbackRows = new Map<string, BookOutcomeEntry[]>();

  for (const participant of participants) {
    for (const line of participant.lines ?? []) {
      const point = parsePoint(line.value);
      for (const [affiliateId, priceData] of Object.entries(line.prices ?? {})) {
        const row: BookOutcomeEntry = {
          name: participant.name,
          price: parsePrice(priceData.price),
          point
        };

        const fallbackExisting = fallbackRows.get(affiliateId) ?? [];
        fallbackExisting.push(row);
        fallbackRows.set(affiliateId, fallbackExisting);

        if (affiliateIds.length && !affiliateIds.includes(affiliateId)) {
          continue;
        }

        const existing = rows.get(affiliateId) ?? [];
        existing.push(row);
        rows.set(affiliateId, existing);
      }
    }
  }

  return rows.size ? rows : fallbackRows;
}

function buildOffers(
  bookmakers: CurrentOddsBookmaker[],
  marketType: keyof CurrentOddsBookmaker["markets"]
) {
  const grouped = new Map<
    string,
    Array<{ name: string; price: number | null; point: number | null; bookTitle: string }>
  >();

  for (const bookmaker of bookmakers) {
    for (const outcome of bookmaker.markets[marketType]) {
      const key = outcome.name.toLowerCase();
      const existing = grouped.get(key) ?? [];
      existing.push({
        ...outcome,
        bookTitle: bookmaker.title
      });
      grouped.set(key, existing);
    }
  }

  return Array.from(grouped.values()).map((rows) => {
    const best = [...rows].sort((left, right) => (right.price ?? -999) - (left.price ?? -999))[0];
    const prices = rows.map((row) => row.price).filter((value): value is number => typeof value === "number");
    const points = rows.map((row) => row.point).filter((value): value is number => typeof value === "number");

    return {
      name: best?.name ?? "Market",
      best_price: best?.price ?? null,
      best_bookmakers: Array.from(new Set(rows.map((row) => row.bookTitle))),
      average_price:
        prices.length > 0
          ? Number((prices.reduce((sum, value) => sum + value, 0) / prices.length).toFixed(2))
          : null,
      book_count: rows.length,
      consensus_point:
        points.length > 0
          ? Number((points.reduce((sum, value) => sum + value, 0) / points.length).toFixed(2))
          : null,
      point_frequency: points.length
    } satisfies CurrentOddsOffer;
  });
}

function buildGame(event: TheRundownEvent, affiliateIds: string[]) {
  const teams = event.teams ?? [];
  const homeTeam = teams.find((team) => team.is_home) ?? teams[1] ?? teams[0];
  const awayTeam = teams.find((team) => team.is_away) ?? teams[0] ?? teams[1];
  const away = buildTeamName(awayTeam, "Away");
  const home = buildTeamName(homeTeam, "Home");
  const bookmakers = new Map<string, CurrentOddsBookmaker>();

  for (const market of event.markets ?? []) {
    // TheRundown commonly uses period_id 0 for full game, but some feeds label full game as 1.
    // Accept both so we don't silently drop all markets and render an empty board.
    if (market.period_id !== 0 && market.period_id !== 1) {
      continue;
    }

    const marketType = normalizeMarketType(market);
    if (!marketType) {
      continue;
    }

    const rows = buildOutcomeRows(market.participants ?? [], affiliateIds);
    for (const [affiliateId, outcomes] of rows.entries()) {
      const bookmaker =
        bookmakers.get(affiliateId) ??
        {
          key: buildBookKey(affiliateId),
          title: buildBookTitle(affiliateId),
          markets: {
            moneyline: [],
            spread: [],
            total: []
          }
        };

      bookmaker.markets[marketType] = outcomes;
      bookmakers.set(affiliateId, bookmaker);
    }
  }

  const bookmakerRows = Array.from(bookmakers.values()).filter(
    (book) =>
      book.markets.moneyline.length || book.markets.spread.length || book.markets.total.length
  );

  if (!bookmakerRows.length) {
    return null;
  }

  return {
    id: event.event_id,
    commence_time: event.event_date ?? new Date().toISOString(),
    home_team: home,
    away_team: away,
    bookmakers_available: bookmakerRows.length,
    bookmakers: bookmakerRows,
    market_stats: {
      moneyline: buildOffers(bookmakerRows, "moneyline"),
      spread: buildOffers(bookmakerRows, "spread"),
      total: buildOffers(bookmakerRows, "total")
    }
  } satisfies CurrentOddsGame;
}

async function fetchLeagueBoard(leagueKey: LeagueKey, dateKey: string) {
  const sportId = THERUNDOWN_SPORT_IDS[leagueKey as keyof typeof THERUNDOWN_SPORT_IDS];
  if (!sportId) {
    return null;
  }

  const affiliateIds = getAffiliateIds();
  const response = await fetchTheRundownJson<TheRundownEventsResponse>(
    `/sports/${sportId}/events/${dateKey}`,
    {
      market_ids: THERUNDOWN_MARKET_IDS,
      offset: THERUNDOWN_OFFSET_MINUTES,
      main_line: "true",
      ...(affiliateIds.length ? { affiliate_ids: affiliateIds.join(",") } : {})
    }
  );

  const events = Array.isArray(response?.events) ? response.events : [];
  const games = events
    .map((event) => buildGame(event, affiliateIds))
    .filter(Boolean) as CurrentOddsGame[];

  if (!games.length) {
    return null;
  }

  return {
    key: leagueKey,
    title: leagueKey,
    short_title: leagueKey,
    game_count: games.length,
    games
  } satisfies CurrentOddsSport;
}

type TheRundownLeagueCacheEntry = {
  generatedAtMs: number;
  sport: CurrentOddsSport | null;
};

declare global {
  // eslint-disable-next-line no-var
  var sharkedgeTheRundownLeagueCache: Map<string, TheRundownLeagueCacheEntry> | undefined;
}

function getLeagueCache() {
  if (!global.sharkedgeTheRundownLeagueCache) {
    global.sharkedgeTheRundownLeagueCache = new Map();
  }
  return global.sharkedgeTheRundownLeagueCache;
}

async function fetchLeagueBoardFast(args: {
  leagueKey: LeagueKey;
  dateKey: string;
  timeoutMs: number;
}) {
  const sportId = THERUNDOWN_SPORT_IDS[args.leagueKey as keyof typeof THERUNDOWN_SPORT_IDS];
  if (!sportId) {
    return null;
  }

  const affiliateIds = getAffiliateIds();
  const response = await fetchTheRundownJsonWithTimeout<TheRundownEventsResponse>({
    path: `/sports/${sportId}/events/${args.dateKey}`,
    params: {
      market_ids: THERUNDOWN_MARKET_IDS,
      offset: THERUNDOWN_OFFSET_MINUTES,
      main_line: "true",
      ...(affiliateIds.length ? { affiliate_ids: affiliateIds.join(",") } : {})
    },
    timeoutMs: args.timeoutMs
  });

  const events = Array.isArray(response?.events) ? response.events : [];
  const games = events
    .map((event) => buildGame(event, affiliateIds))
    .filter(Boolean) as CurrentOddsGame[];

  if (!games.length) {
    return null;
  }

  return {
    key: args.leagueKey,
    title: args.leagueKey,
    short_title: args.leagueKey,
    game_count: games.length,
    games
  } satisfies CurrentOddsSport;
}

export async function fetchTheRundownLeaguesBoard(args: {
  leagues: LeagueKey[];
  timeoutMs?: number;
  cacheTtlMs?: number;
}): Promise<CurrentOddsBoardResponse | null> {
  if (!getApiKey()) {
    return null;
  }

  const leagues = Array.from(new Set(args.leagues)).filter((leagueKey) =>
    THERUNDOWN_SUPPORTED_LEAGUES.includes(leagueKey)
  );
  if (!leagues.length) {
    return null;
  }

  const cache = getLeagueCache();
  const cacheTtlMs = args.cacheTtlMs ?? THERUNDOWN_LEAGUE_CACHE_TTL_MS;
  const timeoutMs = args.timeoutMs ?? 3_000;
  const dateKeys = [
    formatDateKey(new Date()),
    formatDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000))
  ];

  const sports: CurrentOddsSport[] = [];

  for (const leagueKey of leagues) {
    const cached = cache.get(leagueKey);
    if (cached && Date.now() - cached.generatedAtMs < cacheTtlMs) {
      if (cached.sport) {
        sports.push(cached.sport);
      }
      continue;
    }

    let sport: CurrentOddsSport | null = null;
    // Try today then tomorrow. Keep it sequential per league to be gentle on free-tier rate limits.
    for (const dateKey of dateKeys) {
      sport = await fetchLeagueBoardFast({ leagueKey, dateKey, timeoutMs });
      if (sport) {
        break;
      }
    }

    cache.set(leagueKey, { generatedAtMs: Date.now(), sport });
    if (sport) {
      sports.push(sport);
    }
  }

  if (!sports.length) {
    return null;
  }

  return {
    configured: true,
    generated_at: new Date().toISOString(),
    provider: "therundown",
    provider_mode: "therundown_league_cache",
    bookmakers: getAffiliateIds().join(","),
    errors: [],
    sports
  } satisfies CurrentOddsBoardResponse;
}

async function fetchEmergencyBoardFallback() {
  const fallbackLeagues: LeagueKey[] = ["MLB", "NBA"];
  const dateKey = formatDateKey(new Date());

  const sports = (
    await Promise.all(
      fallbackLeagues.map((leagueKey) => fetchLeagueBoard(leagueKey, dateKey))
    )
  ).filter(Boolean) as CurrentOddsSport[];

  if (!sports.length) {
    return null;
  }

  return {
    configured: true,
    generated_at: new Date().toISOString(),
    provider: "therundown",
    provider_mode: "therundown_emergency_fallback",
    bookmakers: getAffiliateIds().join(","),
    errors: ["Primary TheRundown board sweep returned empty; emergency fallback scope is active."],
    sports
  } satisfies CurrentOddsBoardResponse;
}

export const therundownCurrentOddsProvider: CurrentOddsProvider = {
  key: "therundown",
  label: "The Rundown",
  supportsLeague(leagueKey) {
    return THERUNDOWN_SUPPORTED_LEAGUES.includes(leagueKey);
  },
  async fetchBoard() {
    if (!getApiKey()) {
      return null;
    }

    const cached = global.sharkedgeTheRundownBoardCache;
    if (
      cached &&
      Date.now() - cached.generatedAtMs < THERUNDOWN_BOARD_CACHE_TTL_MS
    ) {
      return cached.payload;
    }

    // Sweep today then tomorrow so upcoming games are always visible.
    // Sequential fetches keep free-tier rate limits safe.
    // seenLeagues prevents double-counting a league across date passes.
    const dateKeys = [
      formatDateKey(new Date()),
      formatDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000))
    ];
    const sports: CurrentOddsSport[] = [];
    const seenLeagues = new Set<LeagueKey>();
    for (const dateKey of dateKeys) {
      for (const leagueKey of THERUNDOWN_SUPPORTED_LEAGUES) {
        if (seenLeagues.has(leagueKey)) {
          continue; // already have data for this league from an earlier date pass
        }
        const sport = await fetchLeagueBoard(leagueKey, dateKey);
        if (sport) {
          sports.push(sport);
          seenLeagues.add(leagueKey);
        }
      }
      // Short-circuit if every supported league already has games
      if (seenLeagues.size === THERUNDOWN_SUPPORTED_LEAGUES.length) {
        break;
      }
    }

    const payload = sports.length
      ? ({
      configured: true,
      generated_at: new Date().toISOString(),
      provider: "therundown",
      provider_mode: "therundown",
      bookmakers: getAffiliateIds().join(","),
      errors: [],
      sports
    } satisfies CurrentOddsBoardResponse)
      : null;

    const resolvedPayload = payload ?? (await fetchEmergencyBoardFallback());

    global.sharkedgeTheRundownBoardCache = {
      generatedAtMs: Date.now(),
      payload: resolvedPayload
    };

    return resolvedPayload;
  }
};
