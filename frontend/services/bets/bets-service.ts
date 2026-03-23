import { calculateToWin } from "@/lib/utils/odds";
import {
  calculateAverageOdds,
  calculateBetProfit,
  calculateRecord,
  calculateROI,
  calculateUnits,
  calculateWinRate
} from "@/lib/utils/performance";
import { formatMarketType } from "@/lib/formatters/odds";
import { betFiltersSchema } from "@/lib/validation/filters";
import type {
  BetFilters,
  BetFormInput,
  BetRecord,
  MarketType,
  PerformanceBreakdownRow,
  PerformanceView
} from "@/lib/types/domain";
import { mockDatabase } from "@/prisma/seed-data";
import { getPropById } from "@/services/odds/odds-service";

// TODO: Swap local tracker state for authenticated persistence and sportsbook account sync.

const bookMap = new Map(mockDatabase.sportsbooks.map((book) => [book.id, book]));
const gameMap = new Map(mockDatabase.games.map((game) => [game.id, game]));
const playerMap = new Map(mockDatabase.players.map((player) => [player.id, player]));
const teamMap = new Map(mockDatabase.teams.map((team) => [team.id, team]));

function describeBet(bet: BetRecord) {
  if (bet.playerId) {
    const player = playerMap.get(bet.playerId);
    return player ? `${player.name} ${bet.marketType.replace("player_", "").replace("_", " ")}` : bet.marketType;
  }

  if (bet.gameId) {
    const game = gameMap.get(bet.gameId);
    if (!game) {
      return bet.marketType;
    }

    return `${teamMap.get(game.awayTeamId)?.abbreviation} @ ${teamMap.get(game.homeTeamId)?.abbreviation}`;
  }

  return bet.marketType;
}

function buildBreakdown(
  bets: BetRecord[],
  getLabel: (bet: BetRecord) => string
): PerformanceBreakdownRow[] {
  const buckets = new Map<string, BetRecord[]>();

  for (const bet of bets) {
    const key = getLabel(bet);
    buckets.set(key, [...(buckets.get(key) ?? []), bet]);
  }

  return Array.from(buckets.entries()).map(([label, entryBets]) => {
    const settled = entryBets.filter((bet) => bet.result !== "OPEN");
    const record = calculateRecord(settled);
    const profit = calculateUnits(settled);
    const risked = settled.reduce((total, bet) => total + bet.stake, 0);

    return {
      label,
      bets: entryBets.length,
      winRate: calculateWinRate(record.wins, record.losses, record.pushes),
      roi: calculateROI(profit, risked),
      units: profit
    };
  });
}

export function parseBetFilters(searchParams: Record<string, string | string[] | undefined>) {
  return betFiltersSchema.parse({
    state: Array.isArray(searchParams.state) ? searchParams.state[0] : searchParams.state,
    sport: Array.isArray(searchParams.sport) ? searchParams.sport[0] : searchParams.sport,
    market: Array.isArray(searchParams.market) ? searchParams.market[0] : searchParams.market,
    sportsbook: Array.isArray(searchParams.sportsbook)
      ? searchParams.sportsbook[0]
      : searchParams.sportsbook
  }) satisfies BetFilters;
}

export function getBetTrackerData(filters: BetFilters) {
  const bets = mockDatabase.bets.filter((bet) => {
    const stateMatch =
      filters.state === "ALL"
        ? true
        : filters.state === "OPEN"
          ? bet.result === "OPEN"
          : bet.result !== "OPEN";
    const sportMatch = filters.sport === "ALL" ? true : bet.sport === filters.sport;
    const marketMatch = filters.market === "ALL" ? true : bet.marketType === filters.market;
    const sportsbookMatch =
      filters.sportsbook === "all" ? true : bookMap.get(bet.sportsbookId)?.key === filters.sportsbook;

    return stateMatch && sportMatch && marketMatch && sportsbookMatch;
  });

  const settled = bets.filter((bet) => bet.result !== "OPEN");
  const record = calculateRecord(settled);
  const units = calculateUnits(settled);
  const totalRisked = settled.reduce((total, bet) => total + bet.stake, 0);

  return {
    filters,
    sportsbooks: mockDatabase.sportsbooks,
    bets: bets.map((bet) => ({
      ...bet,
      description: describeBet(bet),
      sportsbook: bookMap.get(bet.sportsbookId)!
    })),
    summary: {
      record: `${record.wins}-${record.losses}-${record.pushes}`,
      units,
      roi: calculateROI(units, totalRisked),
      winRate: calculateWinRate(record.wins, record.losses, record.pushes),
      totalBets: bets.length
    }
  };
}

export async function getBetPrefill(selection: string | undefined) {
  if (!selection) {
    return null;
  }

  const prop = await getPropById(selection);
  if (!prop) {
    return null;
  }

  const sportsbookId =
    bookMap.get(prop.sportsbook.id)?.id ??
    mockDatabase.sportsbooks.find((book) => book.key === prop.sportsbook.key)?.id ??
    mockDatabase.sportsbooks[0]?.id ??
    "book_dk";

  return {
    date: new Date().toISOString().slice(0, 16),
    sport: "BASKETBALL",
    league: prop.leagueKey,
    marketType: prop.marketType,
    side: prop.side,
    line: prop.line,
    oddsAmerican: prop.oddsAmerican,
    sportsbookId,
    stake: 1,
    notes: `Pulled from ${prop.player.name} ${prop.marketType.replace("player_", "")} for ${prop.gameLabel ?? `${prop.team.abbreviation} vs ${prop.opponent.abbreviation}`}.`,
    tags: "quick-log,props",
    gameId: prop.gameId,
    playerId: prop.player.id
  } satisfies BetFormInput;
}

export function describePendingBet(input: BetFormInput) {
  if (input.playerId) {
    const player = playerMap.get(input.playerId);
    if (player) {
      return `${player.name} ${formatMarketType(input.marketType)}`;
    }

    if (input.notes.trim()) {
      return input.notes.split(".")[0] ?? input.notes.trim();
    }
  }

  if (input.gameId) {
    const game = gameMap.get(input.gameId);
    if (game) {
      return `${teamMap.get(game.awayTeamId)?.abbreviation} @ ${teamMap.get(game.homeTeamId)?.abbreviation}`;
    }

    if (input.notes.trim()) {
      return input.notes.split(".")[0] ?? input.notes.trim();
    }
  }

  return `${input.league} ${formatMarketType(input.marketType)}`;
}

export function createClientBetRecord(input: BetFormInput) {
  const stake = input.stake;
  const unitsStake = stake;

  return {
    id: `client_${Date.now()}`,
    userId: "user_demo",
    placedAt: input.date,
    sport: input.sport,
    league: input.league,
    gameId: input.gameId ?? null,
    playerId: input.playerId ?? null,
    marketType: input.marketType as MarketType,
    side: input.side,
    line: input.line,
    oddsAmerican: input.oddsAmerican,
    sportsbookId: input.sportsbookId,
    stake: unitsStake,
    toWin: calculateToWin(unitsStake * 50, input.oddsAmerican) / 50,
    result: "OPEN",
    closingLine: null,
    clvValue: null,
    notes: input.notes,
    tagsJson: input.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    isLive: false
  } satisfies BetRecord;
}

export function getPerformanceDashboard() {
  const settled = mockDatabase.bets.filter((bet) => bet.result !== "OPEN");
  const record = calculateRecord(settled);
  const units = calculateUnits(settled);
  const totalRisked = settled.reduce((total, bet) => total + bet.stake, 0);
  const summary = {
    totalBets: settled.length,
    winRate: calculateWinRate(record.wins, record.losses, record.pushes),
    roi: calculateROI(units, totalRisked),
    units,
    averageOdds: calculateAverageOdds(settled),
    clv: Number(
      (
        settled.reduce((total, bet) => total + (bet.clvValue ?? 0), 0) / Math.max(settled.length, 1)
      ).toFixed(2)
    ),
    record: `${record.wins}-${record.losses}-${record.pushes}`
  };

  const trend = settled
    .slice()
    .sort((left, right) => left.placedAt.localeCompare(right.placedAt))
    .map((bet) => ({
      label: bet.placedAt.slice(5, 10),
      units: calculateBetProfit(bet)
    }));

  return {
    summary,
    bySport: buildBreakdown(settled, (bet) => bet.league),
    byMarket: buildBreakdown(settled, (bet) => bet.marketType),
    bySportsbook: buildBreakdown(settled, (bet) => bookMap.get(bet.sportsbookId)?.name ?? bet.sportsbookId),
    byTiming: buildBreakdown(settled, (bet) => (bet.isLive ? "Live" : "Pregame")),
    trend,
    bestAngles: [
      "NBA assists props have produced the cleanest CLV in the mock portfolio.",
      "Short home favorites under -4 are generating the healthiest hold-adjusted ROI.",
      "DraftKings props are carrying the strongest hit-rate / close-line combination."
    ],
    leaks: [
      "Totals are the softest category in the current sample and need tighter entry thresholds.",
      "Underdog sides without CLV confirmation are dragging efficiency.",
      "Late-night chases remain the easiest leak to trim when volume ramps."
    ]
  } satisfies PerformanceView;
}
