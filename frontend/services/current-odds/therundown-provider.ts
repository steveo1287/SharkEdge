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
const THERUNDOWN_PROVIDER_TIMEOUT_MS = 2_500;
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
  name: string;
  period_id: number;
  participants?: TheRundownParticipant[];
};

type TheRundownTeam = {
  name: string;
};

type TheRundownEvent = {
  event_id: string;
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

function getApiKey() {
  const value = process.env.THERUNDOWN_API_KEY?.trim();
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
  return date.toISOString().slice(0, 10);
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

function parsePoint(value?: string) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMarketName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized === "moneyline") {
    return "moneyline";
  }
  if (normalized === "handicap") {
    return "spread";
  }
  if (normalized === "totals") {
    return "total";
  }
  return null;
}

function buildBookKey(affiliateId: string) {
  return `therundown_${affiliateId}`;
}

function buildBookTitle(affiliateId: string) {
  return `Affiliate ${affiliateId}`;
}

function buildOutcomeRows(
  participants: TheRundownParticipant[],
  affiliateIds: string[]
) {
  const rows = new Map<string, BookOutcomeEntry[]>();

  for (const participant of participants) {
    for (const line of participant.lines ?? []) {
      const point = parsePoint(line.value);
      for (const [affiliateId, priceData] of Object.entries(line.prices ?? {})) {
        if (affiliateIds.length && !affiliateIds.includes(affiliateId)) {
          continue;
        }

        const existing = rows.get(affiliateId) ?? [];
        existing.push({
          name: participant.name,
          price: typeof priceData.price === "number" ? Math.round(priceData.price) : null,
          point
        });
        rows.set(affiliateId, existing);
      }
    }
  }

  return rows;
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
  const away = event.teams?.[0]?.name ?? "Away";
  const home = event.teams?.[1]?.name ?? "Home";
  const bookmakers = new Map<string, CurrentOddsBookmaker>();

  for (const market of event.markets ?? []) {
    if (market.period_id !== 0) {
      continue;
    }

    const marketType = normalizeMarketName(market.name);
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
    commence_time: new Date().toISOString(),
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

  const games = (response?.events ?? [])
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

    const today = formatDateKey(new Date());
    const tomorrow = formatDateKey(new Date(Date.now() + 24 * 60 * 60 * 1000));
    const sports = (
      await Promise.all(
        THERUNDOWN_SUPPORTED_LEAGUES.flatMap((leagueKey) => [
          fetchLeagueBoard(leagueKey, today),
          fetchLeagueBoard(leagueKey, tomorrow)
        ])
      )
    ).filter(Boolean) as CurrentOddsSport[];

    if (!sports.length) {
      return null;
    }

    return {
      configured: true,
      generated_at: new Date().toISOString(),
      provider: "therundown",
      provider_mode: "therundown",
      bookmakers: getAffiliateIds().join(","),
      errors: [],
      sports
    } satisfies CurrentOddsBoardResponse;
  }
};
