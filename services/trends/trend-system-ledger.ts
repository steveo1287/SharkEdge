import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { TrendSystemDefinition } from "@/services/trends/trend-system-engine";

export type TrendSystemLedgerOutcome = "WIN" | "LOSS" | "PUSH" | "VOID" | "OPEN" | "UNAVAILABLE";
export type TrendSystemMetricsSource = "saved-ledger" | "event-market-backtest" | "seeded-fallback";

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
  openRows?: number;
  savedRows?: number;
  eventMarketRows?: number;
};

export type TrendSystemLedgerBacktest = {
  systemId: string;
  generatedAt: string;
  metrics: TrendSystemLedgerMetrics;
  records: TrendSystemLedgerRecord[];
};

export type TrendSystemBacktestOptions = {
  preferSaved?: boolean;
};

const MIN_LEDGER_SAMPLE = 10;
const client = prisma as any;

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function metadata(row: any): Record<string, any> {
  return row?.metadataJson && typeof row.metadataJson === "object" ? row.metadataJson : {};
}

function cleanText(value: unknown) {
  return String(value ?? "").trim();
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

function fallbackMetrics(system: TrendSystemDefinition, reason: string | null, rows = 0, gradedRows = 0): TrendSystemLedgerMetrics {
  return {
    ...system.metrics,
    source: "seeded-fallback",
    reason,
    ledgerRows: rows,
    gradedRows,
    openRows: 0,
    savedRows: 0,
    eventMarketRows: rows
  };
}

function metricsFromRecords(
  system: TrendSystemDefinition,
  records: TrendSystemLedgerRecord[],
  reason: string | null,
  source: Exclude<TrendSystemMetricsSource, "seeded-fallback">,
  minSample: number
): TrendSystemLedgerMetrics {
  const graded = records.filter((record) => record.outcome === "WIN" || record.outcome === "LOSS" || record.outcome === "PUSH");
  const openRows = records.filter((record) => record.outcome === "OPEN").length;

  if (source === "event-market-backtest" && graded.length < minSample) {
    return fallbackMetrics(system, reason ?? `EventMarket backtest sample below floor (${graded.length}/${minSample}).`, records.length, graded.length);
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
    source,
    reason,
    ledgerRows: records.length,
    gradedRows: graded.length,
    openRows,
    savedRows: source === "saved-ledger" ? records.length : 0,
    eventMarketRows: source === "event-market-backtest" ? records.length : 0
  };
}

async function fetchSystemRows(system: TrendSystemDefinition) {
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

async function findSavedDefinition(system: TrendSystemDefinition) {
  return client.savedTrendDefinition.findFirst({
    where: {
      isSystemGenerated: true,
      OR: [
        { name: system.name },
        {
          filterConditionsJson: {
            path: ["publishedSystemId"],
            equals: system.id
          }
        }
      ]
    },
    orderBy: { lastComputedAt: "desc" }
  });
}

function savedOutcome(value: unknown): TrendSystemLedgerOutcome {
  const result = String(value ?? "OPEN").toUpperCase();
  if (result === "WIN" || result === "LOSS" || result === "PUSH" || result === "VOID" || result === "OPEN") return result;
  return "UNAVAILABLE";
}

function savedRecord(system: TrendSystemDefinition, row: any): TrendSystemLedgerRecord {
  const m = metadata(row);
  const odds = finiteNumber(m.price) ?? finiteNumber(m.oddsAmerican) ?? -110;
  const line = finiteNumber(m.line) ?? finiteNumber(m.total) ?? finiteNumber(m.marketLine);
  const outcome = savedOutcome(row.betResult);
  return {
    id: row.id,
    eventLabel: row.event?.name ?? (cleanText(m.eventLabel) || system.name),
    eventId: row.event?.externalEventId ?? row.eventId ?? null,
    startTime: row.event?.startTime?.toISOString?.() ?? row.matchedAt?.toISOString?.() ?? null,
    market: cleanText(m.market) || system.market,
    selection: cleanText(m.selection) || cleanText(m.side) || system.side,
    side: cleanText(m.side) || system.side,
    line,
    oddsAmerican: odds,
    closingOddsAmerican: finiteNumber(m.closingOddsAmerican) ?? null,
    sportsbook: cleanText(m.sportsbook) || null,
    outcome,
    profitUnits: Number((finiteNumber(row.unitsWon) ?? profitUnits(outcome, odds)).toFixed(2)),
    clvPct: finiteNumber(m.clvPct)
  };
}

export async function runSavedTrendSystemLedgerBacktest(system: TrendSystemDefinition): Promise<TrendSystemLedgerBacktest | null> {
  if (!hasUsableServerDatabaseUrl()) return null;

  const definition = await findSavedDefinition(system);
  if (!definition?.id) return null;

  const rows = await client.savedTrendMatch.findMany({
    where: { trendDefinitionId: definition.id },
    include: { event: true },
    orderBy: { matchedAt: "desc" },
    take: 500
  });

  if (!rows.length) return null;

  const records = rows.map((row: any) => savedRecord(system, row));
  return {
    systemId: system.id,
    generatedAt: new Date().toISOString(),
    metrics: metricsFromRecords(
      system,
      records,
      "Saved captured/graded trend ledger. OPEN rows are tracked separately and excluded from ROI until graded.",
      "saved-ledger",
      0
    ),
    records: records.slice(0, 100)
  };
}

export async function runEventMarketTrendSystemBacktest(system: TrendSystemDefinition): Promise<TrendSystemLedgerBacktest> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      systemId: system.id,
      generatedAt: new Date().toISOString(),
      metrics: fallbackMetrics(system, `No usable database URL. Active DB source: ${getServerDatabaseResolution().key ?? "none"}.`),
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
      metrics: metricsFromRecords(system, sorted, "Historical EventMarket/EventResult backtest.", "event-market-backtest", MIN_LEDGER_SAMPLE),
      records: sorted.slice(0, 100)
    };
  } catch (error) {
    return {
      systemId: system.id,
      generatedAt: new Date().toISOString(),
      metrics: fallbackMetrics(system, error instanceof Error ? error.message : "EventMarket backtest failed."),
      records: []
    };
  }
}

export async function runTrendSystemBacktest(system: TrendSystemDefinition, options?: TrendSystemBacktestOptions): Promise<TrendSystemLedgerBacktest> {
  if (options?.preferSaved) {
    try {
      const saved = await runSavedTrendSystemLedgerBacktest(system);
      if (saved) return saved;
    } catch {
      // Fall through to the historical EventMarket backtest. The selected source remains explicit in the response.
    }
  }

  return runEventMarketTrendSystemBacktest(system);
}

export async function runTrendSystemBacktests(systems: TrendSystemDefinition[], options?: TrendSystemBacktestOptions) {
  const results = await Promise.all(systems.map((system) => runTrendSystemBacktest(system, options)));
  const savedLedgerBacked = results.filter((result) => result.metrics.source === "saved-ledger").length;
  const eventMarketBacked = results.filter((result) => result.metrics.source === "event-market-backtest").length;
  const seededFallback = results.filter((result) => result.metrics.source === "seeded-fallback").length;
  return {
    generatedAt: new Date().toISOString(),
    results,
    summary: {
      systems: results.length,
      ledgerBacked: savedLedgerBacked + eventMarketBacked,
      savedLedgerBacked,
      eventMarketBacked,
      seededFallback,
      totalLedgerRows: results.reduce((sum, result) => sum + result.metrics.ledgerRows, 0),
      totalGradedRows: results.reduce((sum, result) => sum + result.metrics.gradedRows, 0),
      totalOpenRows: results.reduce((sum, result) => sum + (result.metrics.openRows ?? 0), 0),
      totalSavedRows: results.reduce((sum, result) => sum + (result.metrics.savedRows ?? 0), 0),
      totalSavedGradedRows: results
        .filter((result) => result.metrics.source === "saved-ledger")
        .reduce((sum, result) => sum + result.metrics.gradedRows, 0),
      totalEventMarketRows: results.reduce((sum, result) => sum + (result.metrics.eventMarketRows ?? 0), 0),
      totalEventMarketGradedRows: results
        .filter((result) => result.metrics.source === "event-market-backtest")
        .reduce((sum, result) => sum + result.metrics.gradedRows, 0)
    }
  };
}
