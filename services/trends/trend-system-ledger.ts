import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { TrendSystemDefinition } from "@/services/trends/trend-system-engine";

export type TrendSystemLedgerOutcome = "WIN" | "LOSS" | "PUSH" | "UNAVAILABLE";
export type TrendSystemMetricsSource = "ledger" | "seeded-fallback";

export type TrendSystemLedgerRecord = {
  id: string;
  eventLabel: string;
  eventId: string | null;
  startTime: string | null;
  market: string;
  selection: string;
  side: string | null;
  line: number | null;
  oddsAmerican: number;
  closingOddsAmerican: number | null;
  sportsbook: string | null;
  outcome: TrendSystemLedgerOutcome;
  profitUnits: number;
  clvPct: number | null;
};

export type TrendSystemLedgerMetrics = TrendSystemDefinition["metrics"] & {
  source: TrendSystemMetricsSource;
  reason: string | null;
  ledgerRows: number;
  gradedRows: number;
};

export type TrendSystemLedgerBacktest = {
  systemId: string;
  generatedAt: string;
  metrics: TrendSystemLedgerMetrics;
  records: TrendSystemLedgerRecord[];
};

const MIN_LEDGER_SAMPLE = 10;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function impliedFromAmerican(odds: number | null | undefined) {
  if (typeof odds !== "number" || !Number.isFinite(odds) || odds === 0 || Math.abs(odds) < 100) return null;
  return odds < 0 ? Math.abs(odds) / (Math.abs(odds) + 100) : 100 / (odds + 100);
}

function profitUnits(outcome: TrendSystemLedgerOutcome, oddsAmerican: number) {
  if (outcome === "WIN") return oddsAmerican > 0 ? oddsAmerican / 100 : 100 / Math.abs(oddsAmerican);
  if (outcome === "LOSS") return -1;
  return 0;
}

function sideMatchesSystem(system: TrendSystemDefinition, market: any, siblings: any[]) {
  const side = String(market.side ?? "").toUpperCase();
  if (system.side === "HOME" || system.side === "AWAY" || system.side === "OVER" || system.side === "UNDER") {
    return side === system.side;
  }

  if (system.side === "FAVORITE" || system.side === "UNDERDOG") {
    const selfProb = finiteNumber(market.impliedProbability) ?? impliedFromAmerican(finiteNumber(market.oddsAmerican)) ?? 0;
    const otherProb = Math.max(
      0,
      ...siblings
        .filter((sibling) => sibling.id !== market.id)
        .map((sibling) => finiteNumber(sibling.impliedProbability) ?? impliedFromAmerican(finiteNumber(sibling.oddsAmerican)) ?? 0)
    );
    if (otherProb <= 0) return false;
    return system.side === "FAVORITE" ? selfProb >= otherProb : selfProb < otherProb;
  }

  return false;
}

function participantForSide(event: any, side: string | null | undefined) {
  const role = String(side ?? "").toUpperCase();
  return event?.participants?.find((participant: any) => String(participant.role ?? "").toUpperCase() === role) ?? null;
}

function resolveMoneylineOutcome(market: any): TrendSystemLedgerOutcome {
  const event = market.event;
  const winnerId = event?.eventResult?.winnerCompetitorId ?? null;
  if (!winnerId) return "UNAVAILABLE";
  const selectedId = market.selectionCompetitorId ?? participantForSide(event, market.side)?.competitorId ?? null;
  if (!selectedId) return "UNAVAILABLE";
  return selectedId === winnerId ? "WIN" : "LOSS";
}

function resolveTotalOutcome(market: any): TrendSystemLedgerOutcome {
  const totalPoints = finiteNumber(market.event?.eventResult?.totalPoints);
  const line = finiteNumber(market.closingLine) ?? finiteNumber(market.currentLine) ?? finiteNumber(market.line);
  const side = String(market.side ?? "").toUpperCase();
  if (totalPoints == null || line == null) return "UNAVAILABLE";
  const delta = totalPoints - line;
  if (delta === 0) return "PUSH";
  if (side === "OVER") return delta > 0 ? "WIN" : "LOSS";
  if (side === "UNDER") return delta < 0 ? "WIN" : "LOSS";
  return "UNAVAILABLE";
}

function resolveOutcome(system: TrendSystemDefinition, market: any): TrendSystemLedgerOutcome {
  if (system.market === "moneyline") return resolveMoneylineOutcome(market);
  if (system.market === "total") return resolveTotalOutcome(market);
  return "UNAVAILABLE";
}

function clvPct(openOdds: number | null, closeOdds: number | null) {
  const openProb = impliedFromAmerican(openOdds);
  const closeProb = impliedFromAmerican(closeOdds);
  if (openProb == null || closeProb == null) return null;
  return Number(((closeProb - openProb) * 100).toFixed(2));
}

function getWindowStart(system: TrendSystemDefinition) {
  const window = system.filters.window;
  if (window === "all") return undefined;
  const days = window === "30d" ? 30 : window === "90d" ? 90 : 365;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date;
}

function streak(records: TrendSystemLedgerRecord[]) {
  const graded = records.filter((record) => record.outcome === "WIN" || record.outcome === "LOSS");
  if (!graded.length) return "N/A";
  const first = graded[0].outcome;
  let count = 0;
  for (const record of graded) {
    if (record.outcome !== first) break;
    count += 1;
  }
  return `${first === "WIN" ? "W" : "L"}${count}`;
}

function seasons(records: TrendSystemLedgerRecord[]) {
  return new Set(
    records
      .map((record) => record.startTime ? new Date(record.startTime).getUTCFullYear() : null)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
  ).size;
}

function metricsFromRecords(system: TrendSystemDefinition, records: TrendSystemLedgerRecord[], reason: string | null): TrendSystemLedgerMetrics {
  const graded = records.filter((record) => record.outcome === "WIN" || record.outcome === "LOSS" || record.outcome === "PUSH");
  if (graded.length < MIN_LEDGER_SAMPLE) {
    return {
      ...system.metrics,
      source: "seeded-fallback",
      reason: reason ?? `Ledger sample below floor (${graded.length}/${MIN_LEDGER_SAMPLE}).`,
      ledgerRows: records.length,
      gradedRows: graded.length
    };
  }

  const wins = graded.filter((record) => record.outcome === "WIN").length;
  const losses = graded.filter((record) => record.outcome === "LOSS").length;
  const pushes = graded.filter((record) => record.outcome === "PUSH").length;
  const profit = graded.reduce((sum, record) => sum + record.profitUnits, 0);
  const winRate = graded.length ? (wins / graded.length) * 100 : 0;
  const roi = graded.length ? (profit / graded.length) * 100 : 0;
  const last30 = graded.slice(0, 30);
  const last30Wins = last30.filter((record) => record.outcome === "WIN").length;
  const clvValues = graded.map((record) => record.clvPct).filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    wins,
    losses,
    pushes,
    profitUnits: Number(profit.toFixed(2)),
    roiPct: Number(roi.toFixed(1)),
    winRatePct: Number(winRate.toFixed(1)),
    sampleSize: graded.length,
    currentStreak: streak(graded),
    last30WinRatePct: last30.length ? Number(((last30Wins / last30.length) * 100).toFixed(1)) : 0,
    clvPct: clvValues.length ? Number((clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length).toFixed(2)) : null,
    seasons: seasons(graded),
    source: "ledger",
    reason,
    ledgerRows: records.length,
    gradedRows: graded.length
  };
}

async function fetchSystemRows(system: TrendSystemDefinition) {
  const client = prisma as any;
  const startTime = getWindowStart(system);
  return client.eventMarket.findMany({
    where: {
      marketType: system.market,
      event: {
        league: { key: system.league },
        ...(startTime ? { startTime: { gte: startTime } } : {}),
        eventResult: { isNot: null }
      }
    },
    include: {
      sportsbook: true,
      selectionCompetitor: true,
      event: {
        include: {
          league: true,
          eventResult: true,
          participants: { include: { competitor: true } }
        }
      }
    },
    orderBy: { updatedAt: "desc" },
    take: 2000
  });
}

export async function runTrendSystemBacktest(system: TrendSystemDefinition): Promise<TrendSystemLedgerBacktest> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      systemId: system.id,
      generatedAt: new Date().toISOString(),
      metrics: {
        ...system.metrics,
        source: "seeded-fallback",
        reason: `No usable database URL. Active DB source: ${getServerDatabaseResolution().key ?? "none"}.`,
        ledgerRows: 0,
        gradedRows: 0
      },
      records: []
    };
  }

  try {
    const rows = await fetchSystemRows(system);
    const groupedByEvent = new Map<string, any[]>();
    for (const row of rows) {
      const key = row.eventId ?? row.event?.id ?? "unknown";
      groupedByEvent.set(key, [...(groupedByEvent.get(key) ?? []), row]);
    }

    const filtered = rows.filter((row: any) => sideMatchesSystem(system, row, groupedByEvent.get(row.eventId ?? row.event?.id ?? "unknown") ?? []));
    const records: TrendSystemLedgerRecord[] = filtered.map((row: any) => {
      const odds = finiteNumber(row.closingOdds) ?? finiteNumber(row.currentOdds) ?? finiteNumber(row.oddsAmerican) ?? 100;
      const closingOdds = finiteNumber(row.closingOdds) ?? null;
      const outcome = resolveOutcome(system, row);
      const line = finiteNumber(row.closingLine) ?? finiteNumber(row.currentLine) ?? finiteNumber(row.line);
      return {
        id: row.id,
        eventLabel: row.event?.name ?? row.marketLabel ?? row.selection,
        eventId: row.event?.externalEventId ?? row.eventId ?? null,
        startTime: row.event?.startTime?.toISOString?.() ?? null,
        market: row.marketType,
        selection: row.selection,
        side: row.side ?? null,
        line,
        oddsAmerican: odds,
        closingOddsAmerican: closingOdds,
        sportsbook: row.sportsbook?.name ?? null,
        outcome,
        profitUnits: Number(profitUnits(outcome, odds).toFixed(2)),
        clvPct: clvPct(finiteNumber(row.oddsAmerican), closingOdds)
      };
    });

    const sorted = records.sort((left, right) => (right.startTime ?? "").localeCompare(left.startTime ?? ""));
    return {
      systemId: system.id,
      generatedAt: new Date().toISOString(),
      metrics: metricsFromRecords(system, sorted, null),
      records: sorted.slice(0, 100)
    };
  } catch (error) {
    return {
      systemId: system.id,
      generatedAt: new Date().toISOString(),
      metrics: {
        ...system.metrics,
        source: "seeded-fallback",
        reason: error instanceof Error ? error.message : "Ledger backtest failed.",
        ledgerRows: 0,
        gradedRows: 0
      },
      records: []
    };
  }
}

export async function runTrendSystemBacktests(systems: TrendSystemDefinition[]) {
  const results = await Promise.all(systems.map((system) => runTrendSystemBacktest(system)));
  return {
    generatedAt: new Date().toISOString(),
    results,
    summary: {
      systems: results.length,
      ledgerBacked: results.filter((result) => result.metrics.source === "ledger").length,
      seededFallback: results.filter((result) => result.metrics.source === "seeded-fallback").length,
      totalLedgerRows: results.reduce((sum, result) => sum + result.metrics.ledgerRows, 0),
      totalGradedRows: results.reduce((sum, result) => sum + result.metrics.gradedRows, 0)
    }
  };
}
