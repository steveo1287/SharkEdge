import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

export type SimAccuracyDiagnostics = {
  ok: boolean;
  databaseReady: boolean;
  tableName: "sim_prediction_snapshots";
  totalSnapshots: number;
  gradedSnapshots: number;
  ungradedSnapshots: number;
  latestCapturedAt: string | null;
  latestGradedAt: string | null;
  error?: string;
};

function emptyDiagnostics(databaseReady: boolean, error?: string): SimAccuracyDiagnostics {
  return {
    ok: databaseReady && !error,
    databaseReady,
    tableName: "sim_prediction_snapshots",
    totalSnapshots: 0,
    gradedSnapshots: 0,
    ungradedSnapshots: 0,
    latestCapturedAt: null,
    latestGradedAt: null,
    error
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function toIso(value: unknown) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function getSimAccuracyDiagnostics(): Promise<SimAccuracyDiagnostics> {
  if (!hasUsableServerDatabaseUrl()) {
    return emptyDiagnostics(false, "No usable server database URL is configured.");
  }

  try {
    const rows = await prisma.$queryRaw<Array<{
      total_snapshots: bigint | number | string;
      graded_snapshots: bigint | number | string;
      latest_captured_at: Date | string | null;
      latest_graded_at: Date | string | null;
    }>>`
      SELECT
        COUNT(*)::bigint AS total_snapshots,
        COUNT(graded_at)::bigint AS graded_snapshots,
        MAX(captured_at) AS latest_captured_at,
        MAX(graded_at) AS latest_graded_at
      FROM sim_prediction_snapshots;
    `;

    const row = rows[0];
    const totalSnapshots = toNumber(row?.total_snapshots);
    const gradedSnapshots = toNumber(row?.graded_snapshots);

    return {
      ok: true,
      databaseReady: true,
      tableName: "sim_prediction_snapshots",
      totalSnapshots,
      gradedSnapshots,
      ungradedSnapshots: Math.max(0, totalSnapshots - gradedSnapshots),
      latestCapturedAt: toIso(row?.latest_captured_at),
      latestGradedAt: toIso(row?.latest_graded_at)
    };
  } catch (error) {
    return emptyDiagnostics(true, error instanceof Error ? error.message : "Unable to read sim accuracy diagnostics.");
  }
}
