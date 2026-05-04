import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type GeneratedTrendRunLogItem = {
  id: string;
  mode: string;
  dryRun: boolean;
  league: string;
  market: string;
  depth: string;
  limitCount: number;
  minSample: number;
  minRoiPct: number;
  historyLimit: number;
  startDate: string | null;
  endDate: string | null;
  sourceConnected: boolean;
  rowsLoaded: number;
  rowsSkipped: number;
  totalCandidates: number;
  returnedCandidates: number;
  readyCount: number;
  insufficientSampleCount: number;
  noRowsCount: number;
  noMatchesCount: number;
  persistedCount: number;
  skippedCount: number;
  status: string;
  sourceNote: string | null;
  createdAt: string;
  topRejectedReasons: Array<{ reason: string; count: number }>;
};

export type GeneratedTrendControlPanelPayload = {
  generatedAt: string;
  sourceNote: string;
  runs: GeneratedTrendRunLogItem[];
  stats: {
    runCount: number;
    latestRunAt: string | null;
    totalRowsLoaded: number;
    totalCandidates: number;
    totalReady: number;
    totalPersisted: number;
    totalSkipped: number;
    dryRunCount: number;
    writeRunCount: number;
  };
};

type RunLogRow = Record<string, unknown>;

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBool(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function asDateString(value: unknown) {
  if (!value) return new Date().toISOString();
  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function summaryJson(row: RunLogRow): Record<string, any> {
  const value = row.summary_json;
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, any>;
  return {};
}

function topRejectedReasons(row: RunLogRow) {
  const summary = summaryJson(row);
  const decisions = Array.isArray(summary.persistence?.decisions) ? summary.persistence.decisions : [];
  const counts = new Map<string, number>();
  for (const decision of decisions) {
    if (decision?.persisted) continue;
    const reason = String(decision?.reason ?? "unknown rejection");
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    .slice(0, 8);
}

function mapRun(row: RunLogRow): GeneratedTrendRunLogItem {
  return {
    id: String(row.id),
    mode: String(row.mode ?? "manual"),
    dryRun: asBool(row.dry_run),
    league: String(row.league ?? "ALL"),
    market: String(row.market ?? "ALL"),
    depth: String(row.depth ?? "core"),
    limitCount: asNumber(row.limit_count),
    minSample: asNumber(row.min_sample),
    minRoiPct: asNumber(row.min_roi_pct),
    historyLimit: asNumber(row.history_limit),
    startDate: row.start_date == null ? null : String(row.start_date),
    endDate: row.end_date == null ? null : String(row.end_date),
    sourceConnected: asBool(row.source_connected),
    rowsLoaded: asNumber(row.rows_loaded),
    rowsSkipped: asNumber(row.rows_skipped),
    totalCandidates: asNumber(row.total_candidates),
    returnedCandidates: asNumber(row.returned_candidates),
    readyCount: asNumber(row.ready_count),
    insufficientSampleCount: asNumber(row.insufficient_sample_count),
    noRowsCount: asNumber(row.no_rows_count),
    noMatchesCount: asNumber(row.no_matches_count),
    persistedCount: asNumber(row.persisted_count),
    skippedCount: asNumber(row.skipped_count),
    status: String(row.status ?? "unknown"),
    sourceNote: row.source_note == null ? null : String(row.source_note),
    createdAt: asDateString(row.created_at),
    topRejectedReasons: topRejectedReasons(row)
  };
}

export async function buildGeneratedTrendControlPanel(limit = 25): Promise<GeneratedTrendControlPanelPayload> {
  if (!hasUsableServerDatabaseUrl()) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Generated trend control panel unavailable because DATABASE_URL is not configured.",
      runs: [],
      stats: {
        runCount: 0,
        latestRunAt: null,
        totalRowsLoaded: 0,
        totalCandidates: 0,
        totalReady: 0,
        totalPersisted: 0,
        totalSkipped: 0,
        dryRunCount: 0,
        writeRunCount: 0
      }
    };
  }

  try {
    const rows = await prisma.$queryRaw<RunLogRow[]>`
      SELECT *
      FROM generated_trend_run_logs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    const runs = rows.map(mapRun);
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: "Generated trend runner control panel reads generated_trend_run_logs. Use the execute endpoint for manual or cron runs.",
      runs,
      stats: {
        runCount: runs.length,
        latestRunAt: runs[0]?.createdAt ?? null,
        totalRowsLoaded: runs.reduce((total, run) => total + run.rowsLoaded, 0),
        totalCandidates: runs.reduce((total, run) => total + run.returnedCandidates, 0),
        totalReady: runs.reduce((total, run) => total + run.readyCount, 0),
        totalPersisted: runs.reduce((total, run) => total + run.persistedCount, 0),
        totalSkipped: runs.reduce((total, run) => total + run.skippedCount, 0),
        dryRunCount: runs.filter((run) => run.dryRun).length,
        writeRunCount: runs.filter((run) => !run.dryRun).length
      }
    };
  } catch (error) {
    return {
      generatedAt: new Date().toISOString(),
      sourceNote: error instanceof Error ? `Generated trend control panel unavailable: ${error.message}` : "Generated trend control panel unavailable.",
      runs: [],
      stats: {
        runCount: 0,
        latestRunAt: null,
        totalRowsLoaded: 0,
        totalCandidates: 0,
        totalReady: 0,
        totalPersisted: 0,
        totalSkipped: 0,
        dryRunCount: 0,
        writeRunCount: 0
      }
    };
  }
}
