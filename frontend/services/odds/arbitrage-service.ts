import type { ArbitrageOpportunityView, LeagueKey } from "@/lib/types/domain";
import { createAbortSignal } from "@/lib/utils/async";
import { buildMatchupHref } from "@/lib/utils/matchups";
import { mockDatabase } from "@/prisma/seed-data";

const EXTERNAL_ARB_ENDPOINT = process.env.SHARKEDGE_EXTERNAL_ARB_ENDPOINT?.trim() ?? "";
const EXTERNAL_ARB_TIMEOUT_MS = 1_800;

function americanToImpliedProbability(odds: number) {
  if (!Number.isFinite(odds) || odds === 0) {
    return null;
  }

  if (odds > 0) {
    return 100 / (odds + 100);
  }

  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function normalizeDateFilter(date: string) {
  if (date === "today" || !date) {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return `${year}${month}${day}`;
  }

  return date === "all" ? "all" : date;
}

function inRequestedWindow(startTime: string, date: string) {
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) {
    return false;
  }

  const normalizedDate = normalizeDateFilter(date);
  if (normalizedDate === "all") {
    return start.getTime() >= Date.now() - 6 * 60 * 60 * 1000;
  }

  const year = Number(normalizedDate.slice(0, 4));
  const month = Number(normalizedDate.slice(4, 6)) - 1;
  const day = Number(normalizedDate.slice(6, 8));
  return (
    start.getFullYear() === year &&
    start.getMonth() === month &&
    start.getDate() === day
  );
}

async function getExternalArbitrageRows(
  league: LeagueKey,
  date: string
): Promise<ArbitrageOpportunityView[]> {
  if (!EXTERNAL_ARB_ENDPOINT) {
    return [];
  }

  try {
    const { signal, cleanup } = createAbortSignal(EXTERNAL_ARB_TIMEOUT_MS);
    try {
      const response = await fetch(`${EXTERNAL_ARB_ENDPOINT}?league=${league}&date=${date}`, {
        cache: "no-store",
        signal
      });

      if (!response.ok) {
        return [];
      }

      const payload = (await response.json()) as { opportunities?: ArbitrageOpportunityView[] };
      return Array.isArray(payload.opportunities) ? payload.opportunities : [];
    } finally {
      cleanup();
    }
  } catch {
    return [];
  }
}

export async function getArbitrageOpportunities(args: {
  league: LeagueKey;
  date: string;
  limit?: number;
}): Promise<ArbitrageOpportunityView[]> {
  const external = await getExternalArbitrageRows(args.league, args.date);
  if (external.length) {
    return external.slice(0, args.limit ?? 4);
  }

  const league = mockDatabase.leagues.find((entry) => entry.key === args.league);
  if (!league) {
    return [];
  }

  const teams = new Map(mockDatabase.teams.map((team) => [team.id, team]));
  const books = new Map(mockDatabase.sportsbooks.map((book) => [book.id, book]));

  const opportunities = mockDatabase.games
    .filter((game) => game.leagueId === league.id)
    .filter((game) => game.status === "PREGAME" || game.status === "LIVE")
    .filter((game) => inRequestedWindow(game.startTime, args.date))
    .map((game) => {
      const moneylines = mockDatabase.markets.filter(
        (market) => market.gameId === game.id && market.marketType === "moneyline"
      );
      const homeRows = moneylines.filter((market) => market.side === game.homeTeamId);
      const awayRows = moneylines.filter((market) => market.side === game.awayTeamId);

      const bestHome = [...homeRows].sort((left, right) => right.oddsAmerican - left.oddsAmerican)[0];
      const bestAway = [...awayRows].sort((left, right) => right.oddsAmerican - left.oddsAmerican)[0];

      if (!bestHome || !bestAway) {
        return null;
      }

      const homeProb = americanToImpliedProbability(bestHome.oddsAmerican);
      const awayProb = americanToImpliedProbability(bestAway.oddsAmerican);
      if (homeProb === null || awayProb === null) {
        return null;
      }

      const impliedTotalPct = (homeProb + awayProb) * 100;
      if (impliedTotalPct >= 100) {
        return null;
      }

      const awayTeam = teams.get(game.awayTeamId);
      const homeTeam = teams.get(game.homeTeamId);
      const homeBook = books.get(bestHome.sportsbookId);
      const awayBook = books.get(bestAway.sportsbookId);
      if (!awayTeam || !homeTeam || !homeBook || !awayBook) {
        return null;
      }

      return {
        id: `arb-${game.id}`,
        leagueKey: args.league,
        eventLabel: `${awayTeam.abbreviation} @ ${homeTeam.abbreviation}`,
        startTime: game.startTime,
        marketLabel: "Moneyline" as const,
        profitPct: Number((100 - impliedTotalPct).toFixed(2)),
        impliedTotalPct: Number(impliedTotalPct.toFixed(2)),
        homeBook: homeBook.name,
        awayBook: awayBook.name,
        homeOddsAmerican: bestHome.oddsAmerican,
        awayOddsAmerican: bestAway.oddsAmerican,
        detailHref: buildMatchupHref(args.league, game.externalEventId),
        source: "internal_catalog" as const,
        note: `Best split price is ${homeBook.name} on ${homeTeam.abbreviation} and ${awayBook.name} on ${awayTeam.abbreviation}.`
      } satisfies ArbitrageOpportunityView;
    })
    .filter((opportunity): opportunity is NonNullable<typeof opportunity> => opportunity !== null)
    .sort((left, right) => {
      if (right.profitPct !== left.profitPct) {
        return right.profitPct - left.profitPct;
      }

      return left.startTime.localeCompare(right.startTime);
    });

  return opportunities.slice(0, args.limit ?? 4);
}
