import type { PrismaClient } from "@prisma/client";

import { HISTORICAL_SOURCE_KEYS } from "./types";

type Db = Pick<PrismaClient, "$queryRawUnsafe">;

type CoverageRow = {
  min_event_start_time: Date | string | null;
  max_event_start_time: Date | string | null;
  min_snapshot_captured_at: Date | string | null;
  max_snapshot_captured_at: Date | string | null;
  event_count: bigint | number | string | null;
  graded_event_count: bigint | number | string | null;
  market_count: bigint | number | string | null;
  snapshot_count: bigint | number | string | null;
  sportsbook_count: bigint | number | string | null;
};

type KeyCountRow = { key: string | number | null; count: bigint | number | string | null };

type CoverageTableStatusRow = {
  markets_without_snapshots: bigint | number | string | null;
  snapshots_without_results: bigint | number | string | null;
};

export type MlbHistoricalOddsCoverage = {
  leagueKey: "MLB";
  minEventStartTime: string | null;
  maxEventStartTime: string | null;
  minSnapshotCapturedAt: string | null;
  maxSnapshotCapturedAt: string | null;
  seasonsAvailable: number[];
  eventCount: number;
  gradedEventCount: number;
  marketCount: number;
  snapshotCount: number;
  sportsbookCount: number;
  sourceKeys: string[];
  marketTypes: string[];
  marketsByType: Record<string, number>;
  rowsBySourceKey: Record<string, number>;
  rowsBySeason: Record<string, number>;
  warnings: string[];
  dataQualityScore: number;
};

function n(value: unknown) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function recordFromRows(rows: KeyCountRow[]) {
  return Object.fromEntries(rows.filter((row) => row.key !== null && row.key !== undefined).map((row) => [String(row.key), n(row.count)]));
}

function scoreCoverage(args: { eventCount: number; gradedEventCount: number; marketCount: number; snapshotCount: number; sportsbookCount: number; sourceKeys: string[] }) {
  let score = 0;
  if (args.eventCount > 0) score += 20;
  if (args.gradedEventCount > 0) score += 25;
  if (args.marketCount > 0) score += 20;
  if (args.snapshotCount > 0) score += 20;
  if (args.sportsbookCount > 1) score += 10;
  if (args.sourceKeys.length > 1) score += 5;
  return Math.min(100, score);
}

export async function getMlbHistoricalOddsCoverage(db: Db): Promise<MlbHistoricalOddsCoverage> {
  const sourceSql = HISTORICAL_SOURCE_KEYS.map((key) => `'${key}'`).join(",");
  const [summaryRows, marketTypeRows, sourceRows, seasonRows, statusRows] = await Promise.all([
    db.$queryRawUnsafe<CoverageRow[]>(`
      SELECT
        MIN(e."startTime") AS min_event_start_time,
        MAX(e."startTime") AS max_event_start_time,
        MIN(ems."capturedAt") AS min_snapshot_captured_at,
        MAX(ems."capturedAt") AS max_snapshot_captured_at,
        COUNT(DISTINCT e.id) AS event_count,
        COUNT(DISTINCT CASE WHEN er.id IS NOT NULL OR e.status = 'FINAL' THEN e.id END) AS graded_event_count,
        COUNT(DISTINCT em.id) AS market_count,
        COUNT(ems.id) AS snapshot_count,
        COUNT(DISTINCT em."sportsbookId") AS sportsbook_count
      FROM event_markets em
      JOIN events e ON e.id = em."eventId"
      JOIN leagues l ON l.id = e."leagueId"
      LEFT JOIN event_market_snapshots ems ON ems."eventMarketId" = em.id
      LEFT JOIN event_results er ON er."eventId" = e.id
      WHERE l.key = 'MLB' AND em."sourceKey" IN (${sourceSql})
    `),
    db.$queryRawUnsafe<KeyCountRow[]>(`
      SELECT em."marketType"::text AS key, COUNT(*) AS count
      FROM event_markets em
      JOIN events e ON e.id = em."eventId"
      JOIN leagues l ON l.id = e."leagueId"
      WHERE l.key = 'MLB' AND em."sourceKey" IN (${sourceSql})
      GROUP BY em."marketType"::text
      ORDER BY em."marketType"::text
    `),
    db.$queryRawUnsafe<KeyCountRow[]>(`
      SELECT COALESCE(em."sourceKey", 'unknown') AS key, COUNT(*) AS count
      FROM event_markets em
      JOIN events e ON e.id = em."eventId"
      JOIN leagues l ON l.id = e."leagueId"
      WHERE l.key = 'MLB' AND em."sourceKey" IN (${sourceSql})
      GROUP BY COALESCE(em."sourceKey", 'unknown')
      ORDER BY key
    `),
    db.$queryRawUnsafe<KeyCountRow[]>(`
      SELECT EXTRACT(YEAR FROM e."startTime")::int AS key, COUNT(DISTINCT e.id) AS count
      FROM event_markets em
      JOIN events e ON e.id = em."eventId"
      JOIN leagues l ON l.id = e."leagueId"
      WHERE l.key = 'MLB' AND em."sourceKey" IN (${sourceSql})
      GROUP BY EXTRACT(YEAR FROM e."startTime")::int
      ORDER BY key
    `),
    db.$queryRawUnsafe<CoverageTableStatusRow[]>(`
      SELECT
        COUNT(DISTINCT CASE WHEN ems.id IS NULL THEN em.id END) AS markets_without_snapshots,
        COUNT(DISTINCT CASE WHEN ems.id IS NOT NULL AND er.id IS NULL AND e.status <> 'FINAL' THEN e.id END) AS snapshots_without_results
      FROM event_markets em
      JOIN events e ON e.id = em."eventId"
      JOIN leagues l ON l.id = e."leagueId"
      LEFT JOIN event_market_snapshots ems ON ems."eventMarketId" = em.id
      LEFT JOIN event_results er ON er."eventId" = e.id
      WHERE l.key = 'MLB' AND em."sourceKey" IN (${sourceSql})
    `)
  ]);

  const summary = summaryRows[0] ?? null;
  const status = statusRows[0] ?? null;
  const marketsByType = recordFromRows(marketTypeRows);
  const rowsBySourceKey = recordFromRows(sourceRows);
  const rowsBySeason = recordFromRows(seasonRows);
  const sourceKeys = Object.keys(rowsBySourceKey).sort();
  const marketTypes = Object.keys(marketsByType).sort();
  const seasonsAvailable = Object.keys(rowsBySeason).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  const coverage = {
    leagueKey: "MLB" as const,
    minEventStartTime: iso(summary?.min_event_start_time),
    maxEventStartTime: iso(summary?.max_event_start_time),
    minSnapshotCapturedAt: iso(summary?.min_snapshot_captured_at),
    maxSnapshotCapturedAt: iso(summary?.max_snapshot_captured_at),
    seasonsAvailable,
    eventCount: n(summary?.event_count),
    gradedEventCount: n(summary?.graded_event_count),
    marketCount: n(summary?.market_count),
    snapshotCount: n(summary?.snapshot_count),
    sportsbookCount: n(summary?.sportsbook_count),
    sourceKeys,
    marketTypes,
    marketsByType,
    rowsBySourceKey,
    rowsBySeason,
    warnings: [] as string[],
    dataQualityScore: 0
  };

  if (coverage.marketCount === 0) coverage.warnings.push("No MLB historical odds markets found for configured source keys.");
  if (coverage.snapshotCount === 0 && coverage.marketCount > 0) coverage.warnings.push("Markets exist without snapshots; opening/closing backtests are limited.");
  if (n(status?.markets_without_snapshots) > 0) coverage.warnings.push(`${n(status?.markets_without_snapshots)} markets have no snapshots.`);
  if (n(status?.snapshots_without_results) > 0) coverage.warnings.push("Snapshots exist without official results; some systems cannot be graded.");
  if (coverage.marketCount > 0 && coverage.gradedEventCount === 0) coverage.warnings.push("Backtesting cannot grade systems because no official/final results were found.");
  if (sourceKeys.length === 1) coverage.warnings.push("Only one historical source key is present; cross-source validation is thin.");
  coverage.dataQualityScore = scoreCoverage(coverage);
  return coverage;
}
