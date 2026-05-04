import { loadHistoricalTrendRows, type HistoricalTrendSourceOptions } from "./historical-trend-source";
import type { HistoricalTrendEvent } from "./trend-backtester";

export type HistoricalTrendAuditOptions = HistoricalTrendSourceOptions & {
  sampleLimit?: number;
};

export type HistoricalTrendAuditBucket = {
  key: string;
  rows: number;
  withPrice: number;
  withClosingPrice: number;
  withResult: number;
  withUnits: number;
  withVenue: number;
  withFilters: number;
  winRows: number;
  lossRows: number;
  pushRows: number;
  voidRows: number;
  pendingRows: number;
  unknownRows: number;
  priceCoveragePct: number;
  closingPriceCoveragePct: number;
  resultCoveragePct: number;
  unitsCoveragePct: number;
  venueCoveragePct: number;
  filterCoveragePct: number;
};

export type HistoricalTrendAuditIssue = {
  id: string;
  date: string | null;
  league: string | null;
  market: string | null;
  matchup: string | null;
  issue: string;
};

export type HistoricalTrendAuditPayload = {
  generatedAt: string;
  sourceConnected: boolean;
  sourceNote: string;
  options: Required<Pick<HistoricalTrendAuditOptions, "league" | "limit">> & {
    startDate: string | null;
    endDate: string | null;
    sampleLimit: number;
  };
  totals: HistoricalTrendAuditBucket;
  byLeague: HistoricalTrendAuditBucket[];
  byMarket: HistoricalTrendAuditBucket[];
  byLeagueMarket: HistoricalTrendAuditBucket[];
  issues: HistoricalTrendAuditIssue[];
  readiness: {
    usableForBacktest: boolean;
    readyLeagues: string[];
    readyMarkets: string[];
    blockers: string[];
    recommendations: string[];
  };
};

const REQUIRED_RESULT_VALUES = new Set(["WIN", "LOSS", "PUSH", "VOID"]);

function pct(count: number, total: number) {
  if (!total) return 0;
  return Number(((count / total) * 100).toFixed(1));
}

function hasNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasResult(row: HistoricalTrendEvent) {
  return REQUIRED_RESULT_VALUES.has(String(row.result ?? "").toUpperCase());
}

function hasFilters(row: HistoricalTrendEvent) {
  return Boolean(row.filters && Object.keys(row.filters).length > 0);
}

function emptyBucket(key: string): HistoricalTrendAuditBucket {
  return {
    key,
    rows: 0,
    withPrice: 0,
    withClosingPrice: 0,
    withResult: 0,
    withUnits: 0,
    withVenue: 0,
    withFilters: 0,
    winRows: 0,
    lossRows: 0,
    pushRows: 0,
    voidRows: 0,
    pendingRows: 0,
    unknownRows: 0,
    priceCoveragePct: 0,
    closingPriceCoveragePct: 0,
    resultCoveragePct: 0,
    unitsCoveragePct: 0,
    venueCoveragePct: 0,
    filterCoveragePct: 0
  };
}

function applyRow(bucket: HistoricalTrendAuditBucket, row: HistoricalTrendEvent) {
  bucket.rows += 1;
  if (hasNumber(row.price)) bucket.withPrice += 1;
  if (hasNumber(row.closingPrice)) bucket.withClosingPrice += 1;
  if (hasResult(row)) bucket.withResult += 1;
  if (hasNumber(row.units)) bucket.withUnits += 1;
  if (row.venue) bucket.withVenue += 1;
  if (hasFilters(row)) bucket.withFilters += 1;

  const result = String(row.result ?? "").toUpperCase();
  if (result === "WIN") bucket.winRows += 1;
  else if (result === "LOSS") bucket.lossRows += 1;
  else if (result === "PUSH") bucket.pushRows += 1;
  else if (result === "VOID") bucket.voidRows += 1;
  else if (result === "PENDING") bucket.pendingRows += 1;
  else bucket.unknownRows += 1;
}

function finalize(bucket: HistoricalTrendAuditBucket): HistoricalTrendAuditBucket {
  return {
    ...bucket,
    priceCoveragePct: pct(bucket.withPrice, bucket.rows),
    closingPriceCoveragePct: pct(bucket.withClosingPrice, bucket.rows),
    resultCoveragePct: pct(bucket.withResult, bucket.rows),
    unitsCoveragePct: pct(bucket.withUnits, bucket.rows),
    venueCoveragePct: pct(bucket.withVenue, bucket.rows),
    filterCoveragePct: pct(bucket.withFilters, bucket.rows)
  };
}

function bucketRows(rows: HistoricalTrendEvent[], keyFor: (row: HistoricalTrendEvent) => string) {
  const buckets = new Map<string, HistoricalTrendAuditBucket>();
  for (const row of rows) {
    const key = keyFor(row) || "UNKNOWN";
    const bucket = buckets.get(key) ?? emptyBucket(key);
    applyRow(bucket, row);
    buckets.set(key, bucket);
  }
  return Array.from(buckets.values()).map(finalize).sort((left, right) => right.rows - left.rows || left.key.localeCompare(right.key));
}

function buildIssues(rows: HistoricalTrendEvent[], sampleLimit: number): HistoricalTrendAuditIssue[] {
  const issues: HistoricalTrendAuditIssue[] = [];
  for (const row of rows) {
    const rowIssues: string[] = [];
    if (!row.id) rowIssues.push("missing id");
    if (!row.date) rowIssues.push("missing date");
    if (!row.league) rowIssues.push("missing league");
    if (!row.market) rowIssues.push("missing market");
    if (!row.side) rowIssues.push("missing side");
    if (!row.matchup) rowIssues.push("missing matchup");
    if (!hasNumber(row.price)) rowIssues.push("missing price");
    if (!hasNumber(row.closingPrice)) rowIssues.push("missing closing price");
    if (!hasResult(row)) rowIssues.push("missing settled result");
    if (!hasNumber(row.units)) rowIssues.push("missing units");
    if (!hasFilters(row)) rowIssues.push("missing normalized filters");

    for (const issue of rowIssues) {
      if (issues.length >= sampleLimit) return issues;
      issues.push({
        id: row.id || "missing-id",
        date: row.date ?? null,
        league: row.league ?? null,
        market: row.market ?? null,
        matchup: row.matchup ?? null,
        issue
      });
    }
  }
  return issues;
}

function readiness(rows: HistoricalTrendEvent[], byLeague: HistoricalTrendAuditBucket[], byMarket: HistoricalTrendAuditBucket[]) {
  const blockers: string[] = [];
  const recommendations: string[] = [];
  const totals = finalize(rows.reduce((bucket, row) => {
    applyRow(bucket, row);
    return bucket;
  }, emptyBucket("ALL")));

  if (rows.length < 500) blockers.push("Historical row count is below 500; generated trend depth will be thin.");
  if (totals.resultCoveragePct < 90) blockers.push("Settled result coverage is below 90%.");
  if (totals.priceCoveragePct < 80) blockers.push("Price coverage is below 80%.");
  if (totals.closingPriceCoveragePct < 50) recommendations.push("Closing-price coverage is below 50%; CLV verification will be conservative.");
  if (totals.filterCoveragePct < 80) blockers.push("Normalized filter coverage is below 80%.");
  if (totals.venueCoveragePct < 50) recommendations.push("Venue coverage is below 50%; home/road trend families will be limited.");

  const readyLeagues = byLeague.filter((bucket) => bucket.rows >= 100 && bucket.resultCoveragePct >= 90 && bucket.priceCoveragePct >= 80).map((bucket) => bucket.key);
  const readyMarkets = byMarket.filter((bucket) => bucket.rows >= 100 && bucket.resultCoveragePct >= 90 && bucket.priceCoveragePct >= 80).map((bucket) => bucket.key);

  if (!readyLeagues.length) blockers.push("No league currently clears the backtest-ready row/price/result thresholds.");
  if (!readyMarkets.length) blockers.push("No market currently clears the backtest-ready row/price/result thresholds.");
  if (!recommendations.length) recommendations.push("Source coverage is adequate for initial generated-trend runs; continue monitoring CLV and filter coverage.");

  return {
    usableForBacktest: blockers.length === 0,
    readyLeagues,
    readyMarkets,
    blockers,
    recommendations
  };
}

export async function buildHistoricalTrendAudit(options: HistoricalTrendAuditOptions = {}): Promise<HistoricalTrendAuditPayload> {
  const sampleLimit = options.sampleLimit ?? 100;
  const source = await loadHistoricalTrendRows(options);
  const rows = source.rows;
  const totals = finalize(rows.reduce((bucket, row) => {
    applyRow(bucket, row);
    return bucket;
  }, emptyBucket("ALL")));
  const byLeague = bucketRows(rows, (row) => row.league || "UNKNOWN");
  const byMarket = bucketRows(rows, (row) => row.market || "UNKNOWN");
  const byLeagueMarket = bucketRows(rows, (row) => `${row.league || "UNKNOWN"}:${row.market || "UNKNOWN"}`);

  return {
    generatedAt: new Date().toISOString(),
    sourceConnected: source.sourceConnected,
    sourceNote: source.sourceNote,
    options: {
      league: options.league ?? "ALL",
      limit: options.limit ?? 5000,
      startDate: options.startDate ?? null,
      endDate: options.endDate ?? null,
      sampleLimit
    },
    totals,
    byLeague,
    byMarket,
    byLeagueMarket,
    issues: buildIssues(rows, sampleLimit),
    readiness: readiness(rows, byLeague, byMarket)
  };
}
