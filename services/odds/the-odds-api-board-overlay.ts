import type { GameCardView } from "@/lib/types/domain";
import { readLatestOddsApiSnapshot } from "@/services/odds/the-odds-api-budget-service";

type OddsApiOutcome = {
  name?: string;
  price?: number;
  point?: number;
};

type OddsApiMarket = {
  key?: string;
  outcomes?: OddsApiOutcome[];
};

type OddsApiBookmaker = {
  key?: string;
  title?: string;
  markets?: OddsApiMarket[];
};

type OddsApiEvent = {
  id?: string;
  sport_key?: string;
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: OddsApiBookmaker[];
};

const SPORT_TO_LEAGUE: Record<string, string> = {
  basketball_nba: "NBA",
  baseball_mlb: "MLB",
  icehockey_nhl: "NHL",
  americanfootball_nfl: "NFL",
  americanfootball_ncaaf: "NCAAF"
};

function normalizeName(value: string | undefined | null) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function eventMatchesGame(event: OddsApiEvent, game: GameCardView) {
  const eventLeague = event.sport_key ? SPORT_TO_LEAGUE[event.sport_key] : null;
  if (eventLeague && eventLeague !== game.leagueKey) return false;

  const eventHome = normalizeName(event.home_team);
  const eventAway = normalizeName(event.away_team);
  const gameHome = normalizeName(game.homeTeam.name);
  const gameAway = normalizeName(game.awayTeam.name);

  return eventHome === gameHome && eventAway === gameAway;
}

function getAllMarkets(event: OddsApiEvent, key: string) {
  return (event.bookmakers ?? []).flatMap((bookmaker) =>
    (bookmaker.markets ?? [])
      .filter((market) => market.key === key)
      .map((market) => ({ bookmaker, market }))
  );
}

function formatOdds(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value;
}

function bestMoneyline(event: OddsApiEvent, game: GameCardView) {
  const markets = getAllMarkets(event, "h2h");
  const homeName = normalizeName(game.homeTeam.name);
  const awayName = normalizeName(game.awayTeam.name);
  const candidates = markets.flatMap(({ bookmaker, market }) =>
    (market.outcomes ?? [])
      .filter((outcome) => [homeName, awayName].includes(normalizeName(outcome.name)))
      .map((outcome) => ({ odds: formatOdds(outcome.price), book: bookmaker.title ?? bookmaker.key ?? "The Odds API" }))
  );
  return candidates.sort((a, b) => b.odds - a.odds)[0] ?? null;
}

function bestSpread(event: OddsApiEvent) {
  const markets = getAllMarkets(event, "spreads");
  const candidates = markets.flatMap(({ bookmaker, market }) =>
    (market.outcomes ?? []).map((outcome) => ({
      odds: formatOdds(outcome.price),
      point: typeof outcome.point === "number" ? outcome.point : null,
      book: bookmaker.title ?? bookmaker.key ?? "The Odds API"
    }))
  );
  return candidates.sort((a, b) => b.odds - a.odds)[0] ?? null;
}

function bestTotal(event: OddsApiEvent) {
  const markets = getAllMarkets(event, "totals");
  const candidates = markets.flatMap(({ bookmaker, market }) =>
    (market.outcomes ?? []).map((outcome) => ({
      odds: formatOdds(outcome.price),
      point: typeof outcome.point === "number" ? outcome.point : null,
      book: bookmaker.title ?? bookmaker.key ?? "The Odds API"
    }))
  );
  return candidates.sort((a, b) => b.odds - a.odds)[0] ?? null;
}

function countBooks(event: OddsApiEvent) {
  return new Set((event.bookmakers ?? []).map((book) => book.key ?? book.title).filter(Boolean)).size;
}

export async function overlayTheOddsApiSnapshot(games: GameCardView[]) {
  const snapshot = await readLatestOddsApiSnapshot();
  const events = (snapshot?.events ?? []) as OddsApiEvent[];
  if (!events.length || !games.length) return games;

  return games.map((game) => {
    const event = events.find((candidate) => eventMatchesGame(candidate, game));
    if (!event) return game;

    const moneyline = bestMoneyline(event, game);
    const spread = bestSpread(event);
    const total = bestTotal(event);
    const bookCount = countBooks(event);

    return {
      ...game,
      venue: game.venue === "Live scoreboard fallback" ? "The Odds API cached snapshot" : game.venue,
      bestBookCount: Math.max(game.bestBookCount, bookCount),
      moneyline: moneyline
        ? {
            ...game.moneyline,
            lineLabel: "Moneyline",
            bestBook: moneyline.book,
            bestOdds: moneyline.odds
          }
        : game.moneyline,
      spread: spread
        ? {
            ...game.spread,
            lineLabel: typeof spread.point === "number" ? String(spread.point) : game.spread.lineLabel,
            bestBook: spread.book,
            bestOdds: spread.odds
          }
        : game.spread,
      total: total
        ? {
            ...game.total,
            lineLabel: typeof total.point === "number" ? `O/U ${total.point}` : game.total.lineLabel,
            bestBook: total.book,
            bestOdds: total.odds
          }
        : game.total
    } satisfies GameCardView;
  });
}
