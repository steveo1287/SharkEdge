import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbPlayerDataPipeTables } from "@/services/players/mlb-player-data-pipe";

export type MlbPlayerDataHealth = {
  ok: boolean;
  generatedAt: string;
  databaseReady: boolean;
  tables: Array<{ name: string; rows: number; latestAt: string | null }>;
  score: number;
  grade: string;
  checks: Array<{ key: string; label: string; status: "PASS" | "WARN" | "FAIL"; detail: string }>;
  warnings: string[];
};

type CountRow = { total: bigint | number | string; latest_at: Date | string | null };

function toNumber(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return 0;
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function grade(score: number) {
  if (score >= 97) return "A+";
  if (score >= 92) return "A";
  if (score >= 85) return "B+";
  if (score >= 78) return "B";
  if (score >= 70) return "C";
  return "PIPE NEEDED";
}

async function tableStat(name: string, sql: string) {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql);
  const row = rows[0];
  return { name, rows: toNumber(row?.total), latestAt: toIso(row?.latest_at) };
}

export async function getMlbPlayerDataHealth(): Promise<MlbPlayerDataHealth> {
  if (!hasUsableServerDatabaseUrl()) {
    return { ok: false, generatedAt: new Date().toISOString(), databaseReady: false, tables: [], score: 0, grade: "PIPE NEEDED", checks: [{ key: "database", label: "Database", status: "FAIL", detail: "No usable server database URL is configured." }], warnings: ["No usable server database URL is configured."] };
  }

  try {
    await ensureMlbPlayerDataPipeTables();
    const tables = await Promise.all([
      tableStat("mlb_player_identity", "SELECT COUNT(*)::bigint AS total, MAX(updated_at) AS latest_at FROM mlb_player_identity"),
      tableStat("mlb_batter_stat_snapshots", "SELECT COUNT(*)::bigint AS total, MAX(captured_at) AS latest_at FROM mlb_batter_stat_snapshots"),
      tableStat("mlb_pitcher_stat_snapshots", "SELECT COUNT(*)::bigint AS total, MAX(captured_at) AS latest_at FROM mlb_pitcher_stat_snapshots"),
      tableStat("mlb_player_ratings", "SELECT COUNT(*)::bigint AS total, MAX(snapshot_at) AS latest_at FROM mlb_player_ratings"),
      tableStat("mlb_pitcher_ratings", "SELECT COUNT(*)::bigint AS total, MAX(snapshot_at) AS latest_at FROM mlb_pitcher_ratings")
    ]);
    const identityRows = tables.find((table) => table.name === "mlb_player_identity")?.rows ?? 0;
    const batterRows = tables.find((table) => table.name === "mlb_batter_stat_snapshots")?.rows ?? 0;
    const pitcherRows = tables.find((table) => table.name === "mlb_pitcher_stat_snapshots")?.rows ?? 0;
    const hitterRatings = tables.find((table) => table.name === "mlb_player_ratings")?.rows ?? 0;
    const pitcherRatings = tables.find((table) => table.name === "mlb_pitcher_ratings")?.rows ?? 0;
    const checks = [
      { key: "identity", label: "Identity map", status: identityRows >= 500 ? "PASS" as const : identityRows > 0 ? "WARN" as const : "FAIL" as const, detail: `${identityRows} player identities loaded.` },
      { key: "batter_stats", label: "Batter stat snapshots", status: batterRows >= 300 ? "PASS" as const : batterRows > 0 ? "WARN" as const : "FAIL" as const, detail: `${batterRows} batter stat snapshots loaded.` },
      { key: "pitcher_stats", label: "Pitcher stat snapshots", status: pitcherRows >= 200 ? "PASS" as const : pitcherRows > 0 ? "WARN" as const : "FAIL" as const, detail: `${pitcherRows} pitcher stat snapshots loaded.` },
      { key: "hitter_ratings", label: "Compiled hitter ratings", status: hitterRatings >= 300 ? "PASS" as const : hitterRatings > 0 ? "WARN" as const : "FAIL" as const, detail: `${hitterRatings} hitter rating rows compiled.` },
      { key: "pitcher_ratings", label: "Compiled pitcher ratings", status: pitcherRatings >= 200 ? "PASS" as const : pitcherRatings > 0 ? "WARN" as const : "FAIL" as const, detail: `${pitcherRatings} pitcher rating rows compiled.` }
    ];
    const score = Math.round(checks.reduce((sum, check) => sum + (check.status === "PASS" ? 20 : check.status === "WARN" ? 10 : 0), 0));
    return { ok: checks.every((check) => check.status !== "FAIL"), generatedAt: new Date().toISOString(), databaseReady: true, tables, score, grade: grade(score), checks, warnings: [] };
  } catch (error) {
    return { ok: false, generatedAt: new Date().toISOString(), databaseReady: true, tables: [], score: 0, grade: "PIPE NEEDED", checks: [{ key: "query", label: "Health query", status: "FAIL", detail: error instanceof Error ? error.message : "Unknown player data health error." }], warnings: [error instanceof Error ? error.message : "Unknown player data health error."] };
  }
}
