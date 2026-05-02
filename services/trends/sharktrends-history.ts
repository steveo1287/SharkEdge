import { PUBLISHED_SYSTEMS } from "@/services/trends/trend-system-engine";
import { runTrendSystemBacktest, type TrendSystemLedgerOutcome, type TrendSystemLedgerRecord } from "@/services/trends/trend-system-ledger";

const GAME_HISTORY_LIMIT = 100;

function outcomeTone(outcome: TrendSystemLedgerOutcome) {
  if (outcome === "WIN") return "good";
  if (outcome === "LOSS") return "bad";
  if (outcome === "PUSH" || outcome === "VOID") return "neutral";
  return "warn";
}

function formatOdds(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value > 0 ? `+${value}` : String(value);
}

function formatLine(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return String(value);
}

function historyRow(record: TrendSystemLedgerRecord, index: number) {
  return {
    rank: index + 1,
    id: record.id,
    eventLabel: record.eventLabel,
    eventId: record.eventId,
    startTime: record.startTime,
    market: record.market,
    selection: record.selection,
    side: record.side,
    line: record.line,
    lineLabel: formatLine(record.line),
    oddsAmerican: record.oddsAmerican,
    oddsLabel: formatOdds(record.oddsAmerican),
    closingOddsAmerican: record.closingOddsAmerican,
    closingOddsLabel: formatOdds(record.closingOddsAmerican),
    sportsbook: record.sportsbook,
    outcome: record.outcome,
    outcomeTone: outcomeTone(record.outcome),
    profitUnits: record.profitUnits,
    clvPct: record.clvPct,
    summary: `${record.outcome} · ${record.profitUnits > 0 ? "+" : ""}${record.profitUnits}u · ${record.selection}${record.line != null ? ` ${record.line}` : ""} ${formatOdds(record.oddsAmerican) ?? ""}`.trim()
  };
}

function historySummary(records: TrendSystemLedgerRecord[]) {
  const wins = records.filter((record) => record.outcome === "WIN").length;
  const losses = records.filter((record) => record.outcome === "LOSS").length;
  const pushes = records.filter((record) => record.outcome === "PUSH").length;
  const open = records.filter((record) => record.outcome === "OPEN").length;
  const unavailable = records.filter((record) => record.outcome === "UNAVAILABLE").length;
  const graded = wins + losses + pushes;
  const profitUnits = Number(records.reduce((sum, record) => sum + record.profitUnits, 0).toFixed(2));
  const roiPct = graded ? Number(((profitUnits / graded) * 100).toFixed(1)) : 0;
  const winRatePct = graded ? Number(((wins / graded) * 100).toFixed(1)) : 0;
  const clvValues = records.map((record) => record.clvPct).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const avgClvPct = clvValues.length ? Number((clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length).toFixed(2)) : null;
  return {
    rows: records.length,
    graded,
    wins,
    losses,
    pushes,
    open,
    unavailable,
    record: `${wins}-${losses}${pushes ? `-${pushes}` : ""}`,
    profitUnits,
    roiPct,
    winRatePct,
    avgClvPct
  };
}

export async function buildSharkTrendsGameHistory(systemId: string | null | undefined) {
  const id = systemId?.trim();
  if (!id) return null;

  const system = PUBLISHED_SYSTEMS.find((item) => item.id === id);
  if (!system) return null;

  const backtest = await runTrendSystemBacktest(system, { preferSaved: true });
  const rows = backtest.records.slice(0, GAME_HISTORY_LIMIT).map(historyRow);

  return {
    ok: true,
    systemId: system.id,
    systemName: system.name,
    generatedAt: new Date().toISOString(),
    backtestGeneratedAt: backtest.generatedAt,
    source: backtest.metrics.source,
    reason: backtest.metrics.reason,
    limits: {
      returnedRows: rows.length,
      maxRows: GAME_HISTORY_LIMIT
    },
    summary: historySummary(backtest.records),
    rows
  };
}
