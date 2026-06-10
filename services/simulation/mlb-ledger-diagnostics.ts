import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbIntelV7Ledgers, getMlbIntelV7LedgerSummary } from "@/services/simulation/mlb-intel-v7-ledgers";
import { getMlbV8ProductionMode } from "@/services/simulation/mlb-v8-production-control";
import { getMlbV8PromotionGate } from "@/services/simulation/mlb-v8-promotion-gate";
import { getActiveMlbV8PlayerImpactProfile } from "@/services/simulation/mlb-v8-player-impact-profile";

type CountRow = { count: bigint | number | null };
type TimestampRow = { latest: Date | string | null };
type BreakdownRow = { label: string | null; count: bigint | number | null };

function count(row: CountRow | undefined) {
  return Number(row?.count ?? 0);
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function rowsByLabel(rows: BreakdownRow[]) {
  return Object.fromEntries(rows.map((row) => [row.label ?? "unknown", Number(row.count ?? 0)]));
}

async function tableCount(table: "mlb_model_snapshot_ledger" | "mlb_official_pick_ledger", where = "") {
  const rows = (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::bigint AS count FROM ${table} ${where};`)) as CountRow[];
  return count(rows[0]);
}

async function latestTimestamp(table: "mlb_model_snapshot_ledger" | "mlb_official_pick_ledger", column: "captured_at" | "released_at" | "graded_at") {
  const rows = (await prisma.$queryRawUnsafe(`SELECT MAX(${column}) AS latest FROM ${table};`)) as TimestampRow[];
  return iso(rows[0]?.latest);
}

async function breakdown(table: "mlb_model_snapshot_ledger" | "mlb_official_pick_ledger", column: "result" | "model_version") {
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT ${column} AS label, COUNT(*)::bigint AS count
    FROM ${table}
    GROUP BY ${column}
    ORDER BY count DESC;
  `)) as BreakdownRow[];
  return rowsByLabel(rows);
}

async function pendingPastStart(table: "mlb_model_snapshot_ledger" | "mlb_official_pick_ledger") {
  const rows = (await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::bigint AS count
    FROM ${table}
    WHERE result = 'PENDING'
      AND start_time < now() - interval '4 hours';
  `)) as CountRow[];
  return count(rows[0]);
}

async function playerImpactEligibleRows() {
  const rows = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*)::bigint AS count
    FROM mlb_model_snapshot_ledger
    WHERE result IN ('WIN', 'LOSS')
      AND prediction_json IS NOT NULL
      AND prediction_json::text LIKE '%playerImpact%';
  `;
  return count(rows[0]);
}

export async function getMlbLedgerDiagnostics(windowDays = 180) {
  const generatedAt = new Date().toISOString();
  const safeWindowDays = Math.max(1, Math.min(3650, Math.round(windowDays)));
  const databaseReady = hasUsableServerDatabaseUrl() && await ensureMlbIntelV7Ledgers();

  if (!databaseReady) {
    return {
      ok: false,
      generatedAt,
      databaseReady: false,
      warnings: ["No usable server database URL is configured."],
      recommendations: ["Restore DATABASE_URL before ledger capture, settlement, or profile fitting can work."]
    };
  }

  const [
    summary,
    gate,
    profile,
    snapshotTotal,
    snapshotSettled,
    snapshotPending,
    officialTotal,
    officialSettled,
    officialPending,
    latestSnapshotCapturedAt,
    latestOfficialReleasedAt,
    latestSnapshotGradedAt,
    latestOfficialGradedAt,
    snapshotByResult,
    officialByResult,
    snapshotByModel,
    officialByModel,
    staleSnapshotPending,
    staleOfficialPending,
    impactRows
  ] = await Promise.all([
    getMlbIntelV7LedgerSummary(safeWindowDays),
    getMlbV8PromotionGate(safeWindowDays),
    getActiveMlbV8PlayerImpactProfile(),
    tableCount("mlb_model_snapshot_ledger"),
    tableCount("mlb_model_snapshot_ledger", "WHERE graded_at IS NOT NULL"),
    tableCount("mlb_model_snapshot_ledger", "WHERE result = 'PENDING'"),
    tableCount("mlb_official_pick_ledger"),
    tableCount("mlb_official_pick_ledger", "WHERE graded_at IS NOT NULL"),
    tableCount("mlb_official_pick_ledger", "WHERE result = 'PENDING'"),
    latestTimestamp("mlb_model_snapshot_ledger", "captured_at"),
    latestTimestamp("mlb_official_pick_ledger", "released_at"),
    latestTimestamp("mlb_model_snapshot_ledger", "graded_at"),
    latestTimestamp("mlb_official_pick_ledger", "graded_at"),
    breakdown("mlb_model_snapshot_ledger", "result"),
    breakdown("mlb_official_pick_ledger", "result"),
    breakdown("mlb_model_snapshot_ledger", "model_version"),
    breakdown("mlb_official_pick_ledger", "model_version"),
    pendingPastStart("mlb_model_snapshot_ledger"),
    pendingPastStart("mlb_official_pick_ledger"),
    playerImpactEligibleRows()
  ]);

  const warnings: string[] = [];
  const recommendations: string[] = [];

  if (officialTotal === 0) {
    warnings.push(`Official pick ledger is empty. Current production mode is ${getMlbV8ProductionMode()} and V8 gate mode is ${gate.mode}.`);
    if (gate.mode === "shadow_only" || gate.mode === "blocked") {
      recommendations.push("Keep V8 in shadow, but add or enable a V7 control-pick ledger if you want official pick sample growth before V8 promotion.");
    }
  }
  if (impactRows < 100) warnings.push(`Only ${impactRows} settled player-impact training rows are available; learned profile remains sample-limited.`);
  if (staleSnapshotPending > 0) warnings.push(`${staleSnapshotPending} snapshot rows are still pending more than 4 hours after start time.`);
  if (staleOfficialPending > 0) warnings.push(`${staleOfficialPending} official pick rows are still pending more than 4 hours after start time.`);
  if (profile.status !== "LEARNED") recommendations.push("Let the profile cron fit after more settled rows arrive; do not widen model confidence only to remove warnings.");

  return {
    ok: true,
    generatedAt,
    databaseReady: true,
    productionMode: getMlbV8ProductionMode(),
    gate: {
      mode: gate.mode,
      sourceStatus: gate.sourceStatus,
      allowOfficialV8Promotion: gate.allowOfficialV8Promotion,
      blockers: gate.blockers,
      warnings: gate.warnings
    },
    profile: {
      status: profile.status,
      sampleSize: profile.sampleSize,
      trainedAt: profile.trainedAt,
      reliability: profile.metrics.reliability ?? null,
      sourceRows: profile.metrics.sourceRows ?? null
    },
    ledger: {
      windowDays: safeWindowDays,
      summary,
      snapshots: {
        total: snapshotTotal,
        settled: snapshotSettled,
        pending: snapshotPending,
        stalePendingPastStart: staleSnapshotPending,
        latestCapturedAt: latestSnapshotCapturedAt,
        latestGradedAt: latestSnapshotGradedAt,
        byResult: snapshotByResult,
        byModelVersion: snapshotByModel
      },
      officialPicks: {
        total: officialTotal,
        settled: officialSettled,
        pending: officialPending,
        stalePendingPastStart: staleOfficialPending,
        latestReleasedAt: latestOfficialReleasedAt,
        latestGradedAt: latestOfficialGradedAt,
        byResult: officialByResult,
        byModelVersion: officialByModel
      },
      trainingRows: {
        playerImpactEligible: impactRows
      }
    },
    warnings,
    recommendations
  };
}
