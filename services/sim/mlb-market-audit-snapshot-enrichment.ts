import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

type SnapshotRow = {
  id: string;
  game_id: string;
  event_label: string | null;
  away_team: string | null;
  home_team: string | null;
  start_time: Date | string | null;
  status: string | null;
  market_total: number | string | null;
  prediction_json: unknown;
};

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function round(value: number | null | undefined, digits = 4) {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function parseJson(value: unknown) {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function get(source: unknown, path: string) {
  let current: unknown = source;
  for (const part of path.split(".")) {
    const object = record(current);
    if (!object) return undefined;
    current = object[part];
  }
  return current;
}

function needsAuditPayload(row: SnapshotRow) {
  const payload = record(parseJson(row.prediction_json));
  if (!payload) return true;
  if (!Array.isArray(payload.trackedMarkets)) return true;
  const mlbIntel = record(payload.mlbIntel);
  if (!mlbIntel) return true;
  return !mlbIntel.playerImpact && !mlbIntel.inningProjection;
}

function snapshotGame(row: SnapshotRow) {
  const label = row.event_label ?? `${row.away_team ?? "Away"} @ ${row.home_team ?? "Home"}`;
  const start = row.start_time instanceof Date ? row.start_time : row.start_time ? new Date(String(row.start_time)) : new Date();
  return {
    id: row.game_id,
    label,
    startTime: Number.isNaN(start.getTime()) ? new Date().toISOString() : start.toISOString(),
    status: row.status ?? "SCHEDULED",
    leagueKey: "MLB" as const,
    leagueLabel: "MLB"
  };
}

function trackedMarkets(args: { projection: Awaited<ReturnType<typeof buildSimProjection>>; marketTotal: number | null }) {
  const { projection, marketTotal } = args;
  const mlbIntel = projection.mlbIntel as Record<string, unknown> | null | undefined;
  const inning = record(get(mlbIntel, "playerImpact.inningProjection")) ?? record(get(mlbIntel, "inningProjection"));
  const homeWin = projection.distribution.homeWinPct;
  const awayWin = projection.distribution.awayWinPct;
  const modelTotal = projection.distribution.avgAway + projection.distribution.avgHome;
  const f5Home = numberValue(get(inning, "firstFiveHomeWinProbability"));
  const f5Away = numberValue(get(inning, "firstFiveAwayWinProbability"));
  const nrfi = numberValue(get(inning, "nrfiProbability"));
  const yrfi = numberValue(get(inning, "yrfiProbability"));
  return [
    { market: "MONEYLINE", side: homeWin >= awayWin ? "HOME" : "AWAY", modelProbability: round(homeWin >= awayWin ? homeWin : awayWin), modelValue: null, line: null, source: "distribution" },
    { market: "FULL_TOTAL", side: marketTotal == null ? null : modelTotal >= marketTotal ? "OVER" : "UNDER", modelProbability: null, modelValue: round(modelTotal, 3), line: marketTotal, source: "distribution+market_total" },
    { market: "F5_MONEYLINE", side: f5Home == null || f5Away == null ? null : f5Home >= f5Away ? "HOME" : "AWAY", modelProbability: f5Home == null || f5Away == null ? null : round(Math.max(f5Home, f5Away)), modelValue: round(numberValue(get(inning, "firstFiveTotalRuns")), 3), line: null, source: "inningProjection" },
    { market: "NRFI_YRFI", side: nrfi == null || yrfi == null ? null : nrfi >= yrfi ? "NRFI" : "YRFI", modelProbability: nrfi == null || yrfi == null ? null : round(Math.max(nrfi, yrfi)), modelValue: round(numberValue(get(inning, "innings.0.expectedRuns")), 3), line: 0, source: "inningProjection" }
  ];
}

export async function enrichMlbMarketAuditSnapshots(limit = 100) {
  if (!hasUsableServerDatabaseUrl()) return { ok: false, databaseReady: false, scanned: 0, enriched: 0, skipped: 0, error: "No usable server database URL is configured." };

  const rows = await prisma.$queryRaw<SnapshotRow[]>`
    SELECT id, game_id, event_label, away_team, home_team, start_time, status, market_total, prediction_json
    FROM sim_prediction_snapshots
    WHERE UPPER(league) = 'MLB'
      AND captured_at >= now() - interval '14 days'
    ORDER BY captured_at DESC
    LIMIT ${Math.max(1, Math.min(500, Math.round(limit)))};
  `;

  let enriched = 0;
  let skipped = 0;
  for (const row of rows.filter(needsAuditPayload)) {
    try {
      const projection = await buildSimProjection(snapshotGame(row));
      const mlbIntel = projection.mlbIntel as Record<string, unknown> | null | undefined;
      const playerImpact = record(get(mlbIntel, "playerImpact"));
      const inningProjection = record(get(mlbIntel, "playerImpact.inningProjection")) ?? record(get(mlbIntel, "inningProjection"));
      const existing = record(parseJson(row.prediction_json)) ?? {};
      const existingMlbIntel = record(existing.mlbIntel) ?? {};
      const markets = trackedMarkets({ projection, marketTotal: numberValue(row.market_total) });
      const payload = {
        ...existing,
        version: existing.version ?? "v3-market-audit-enriched",
        trackedMarkets: markets,
        mlbIntel: { ...existingMlbIntel, playerImpact: playerImpact ?? existingMlbIntel.playerImpact ?? null, inningProjection: inningProjection ?? existingMlbIntel.inningProjection ?? null, trackedMarkets: markets }
      };
      await prisma.$executeRaw`
        UPDATE sim_prediction_snapshots
        SET prediction_json = ${JSON.stringify(payload)}::jsonb,
            updated_at = now()
        WHERE id = ${row.id};
      `;
      enriched += 1;
    } catch (error) {
      console.error("[mlb-market-audit-enrichment] failed", row.game_id, error);
      skipped += 1;
    }
  }

  return { ok: true, databaseReady: true, scanned: rows.length, enriched, skipped };
}
