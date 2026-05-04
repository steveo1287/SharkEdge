import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { buildMarketDataSourceSummary } from "@/services/trends/market-data-source";
import type { OddsApiIoIngestionOptions, OddsApiIoIngestionResult } from "./odds-api-io-ingestion";

export type OddsApiIoRunLog = {
  id: string;
  mode: string;
  league: string;
  sport: string;
  status: string;
  dryRun: boolean;
  ok: boolean;
  providerEvents: number;
  matchedInternalEvents: number;
  oddsRows: number;
  snapshotsWritten: number;
  lineRowsWritten: number;
  skippedOddsRows: number;
  rateLimitRemaining: string | null;
  error: string | null;
  createdAt: string;
};

export type OddsApiIoHealthPayload = {
  generatedAt: string;
  sourceNote: string;
  configured: {
    apiKey: boolean;
    writeSecret: boolean;
  };
  stats: {
    runCount: number;
    successfulRuns: number;
    failedRuns: number;
    latestRunAt: string | null;
    latestSuccessAt: string | null;
    totalProviderEvents: number;
    totalOddsRows: number;
    totalSnapshotsWritten: number;
    totalLineRowsWritten: number;
    latestRateLimitRemaining: string | null;
  };
  recentRuns: OddsApiIoRunLog[];
  marketCoverage: Awaited<ReturnType<typeof buildMarketDataSourceSummary>>;
  attachmentReadiness: {
    oddsRowsAvailable: boolean;
    lineRowsAvailable: boolean;
    marketMovementAvailable: boolean;
    blockers: string[];
  };
};

type Row = Record<string, unknown>;

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBool(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function asDate(value: unknown) {
  if (!value) return new Date().toISOString();
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function idSafe(value: string) {
  return value.replace(/[^a-zA-Z0-9_:-]/g, "_").slice(0, 180);
}

async function ensureRunLogTable() {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS odds_api_io_ingestion_runs (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL DEFAULT 'manual',
      league TEXT NOT NULL DEFAULT 'MLB',
      sport TEXT NOT NULL DEFAULT 'baseball',
      status TEXT NOT NULL DEFAULT 'upcoming',
      dry_run BOOLEAN NOT NULL DEFAULT true,
      ok BOOLEAN NOT NULL DEFAULT false,
      provider_events INTEGER NOT NULL DEFAULT 0,
      matched_internal_events INTEGER NOT NULL DEFAULT 0,
      odds_rows INTEGER NOT NULL DEFAULT 0,
      snapshots_written INTEGER NOT NULL DEFAULT 0,
      line_rows_written INTEGER NOT NULL DEFAULT 0,
      skipped_odds_rows INTEGER NOT NULL DEFAULT 0,
      rate_limit_remaining TEXT,
      error TEXT,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS odds_api_io_ingestion_runs_created_idx ON odds_api_io_ingestion_runs (created_at DESC)`;
  await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS odds_api_io_ingestion_runs_mode_idx ON odds_api_io_ingestion_runs (mode, ok, created_at DESC)`;
}

function mapRun(row: Row): OddsApiIoRunLog {
  return {
    id: String(row.id),
    mode: String(row.mode ?? "manual"),
    league: String(row.league ?? "MLB"),
    sport: String(row.sport ?? "baseball"),
    status: String(row.status ?? "upcoming"),
    dryRun: asBool(row.dry_run),
    ok: asBool(row.ok),
    providerEvents: asNumber(row.provider_events),
    matchedInternalEvents: asNumber(row.matched_internal_events),
    oddsRows: asNumber(row.odds_rows),
    snapshotsWritten: asNumber(row.snapshots_written),
    lineRowsWritten: asNumber(row.line_rows_written),
    skippedOddsRows: asNumber(row.skipped_odds_rows),
    rateLimitRemaining: row.rate_limit_remaining == null ? null : String(row.rate_limit_remaining),
    error: row.error == null ? null : String(row.error),
    createdAt: asDate(row.created_at)
  };
}

export async function recordOddsApiIoRun(args: {
  mode: string;
  options: OddsApiIoIngestionOptions;
  result?: OddsApiIoIngestionResult;
  error?: string | null;
}) {
  if (!hasUsableServerDatabaseUrl()) return;
  try {
    await ensureRunLogTable();
    const result = args.result;
    const providerMeta = result?.providerMeta ?? [];
    const latestMeta = providerMeta[providerMeta.length - 1];
    const id = idSafe(`oddsapiio:${args.mode}:${args.options.league ?? "MLB"}:${Date.now()}:${Math.random().toString(16).slice(2)}`);
    const ok = Boolean(result && !args.error);
    const payload = { options: { ...args.options, dryRun: args.options.dryRun ?? true }, providerMeta, sourceNote: result?.sourceNote ?? null };

    await prisma.$executeRaw`
      INSERT INTO odds_api_io_ingestion_runs (
        id, mode, league, sport, status, dry_run, ok,
        provider_events, matched_internal_events, odds_rows, snapshots_written, line_rows_written, skipped_odds_rows,
        rate_limit_remaining, error, payload_json
      ) VALUES (
        ${id},
        ${args.mode},
        ${args.options.league ?? "MLB"},
        ${args.options.sport},
        ${args.options.status ?? "upcoming"},
        ${args.options.dryRun ?? true},
        ${ok},
        ${result?.stats.providerEvents ?? 0},
        ${result?.stats.matchedInternalEvents ?? 0},
        ${result?.stats.oddsRows ?? 0},
        ${result?.stats.snapshotsWritten ?? 0},
        ${result?.stats.lineRowsWritten ?? 0},
        ${result?.stats.skippedOddsRows ?? 0},
        ${latestMeta?.remaining ?? null},
        ${args.error ?? null},
        ${payload}
      )
    `;
  } catch {
    // Run logging must never break ingestion.
  }
}

async function readRuns(limit = 25) {
  if (!hasUsableServerDatabaseUrl()) return [];
  try {
    await ensureRunLogTable();
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT *
      FROM odds_api_io_ingestion_runs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map(mapRun);
  } catch {
    return [];
  }
}

export async function buildOddsApiIoHealth(limit = 25): Promise<OddsApiIoHealthPayload> {
  const [runs, marketCoverage] = await Promise.all([readRuns(limit), buildMarketDataSourceSummary()]);
  const latestSuccess = runs.find((run) => run.ok && !run.dryRun);
  const blockers: string[] = [];
  const oddsRowsAvailable = marketCoverage.tables.oddsSnapshots > 0;
  const lineRowsAvailable = marketCoverage.tables.lineHistory > 0;
  const marketMovementAvailable = lineRowsAvailable;

  if (!process.env.ODDS_API_IO_KEY && !process.env.ODDS_API_KEY) blockers.push("Provider API key is not configured.");
  if (!process.env.CRON_SECRET && !process.env.ODDS_API_IO_INGEST_SECRET && !process.env.INGEST_SECRET) blockers.push("Write/cron secret is not configured.");
  if (!runs.length) blockers.push("No Odds-API.io ingestion runs have been logged.");
  if (!oddsRowsAvailable) blockers.push("No market_odds_snapshots rows are available.");
  if (!lineRowsAvailable) blockers.push("No market_line_history rows are available.");

  return {
    generatedAt: new Date().toISOString(),
    sourceNote: "Odds-API.io health tracks ingestion runs, write counts, rate-limit hints, and market-row coverage. Run logging is self-healing and does not require build-time migrations.",
    configured: {
      apiKey: Boolean(process.env.ODDS_API_IO_KEY ?? process.env.ODDS_API_KEY),
      writeSecret: Boolean(process.env.CRON_SECRET ?? process.env.ODDS_API_IO_INGEST_SECRET ?? process.env.INGEST_SECRET)
    },
    stats: {
      runCount: runs.length,
      successfulRuns: runs.filter((run) => run.ok).length,
      failedRuns: runs.filter((run) => !run.ok).length,
      latestRunAt: runs[0]?.createdAt ?? null,
      latestSuccessAt: latestSuccess?.createdAt ?? null,
      totalProviderEvents: runs.reduce((total, run) => total + run.providerEvents, 0),
      totalOddsRows: runs.reduce((total, run) => total + run.oddsRows, 0),
      totalSnapshotsWritten: runs.reduce((total, run) => total + run.snapshotsWritten, 0),
      totalLineRowsWritten: runs.reduce((total, run) => total + run.lineRowsWritten, 0),
      latestRateLimitRemaining: runs[0]?.rateLimitRemaining ?? null
    },
    recentRuns: runs,
    marketCoverage,
    attachmentReadiness: {
      oddsRowsAvailable,
      lineRowsAvailable,
      marketMovementAvailable,
      blockers
    }
  };
}
