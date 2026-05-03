import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

import {
  lookupNbaPropCalibration,
  normalizeNbaPropStatKey,
  summarizeNbaPropCalibrationBuckets,
  type NbaPropCalibrationBucket,
  type NbaPropCalibrationLookup,
  type NbaPropCalibrationRow
} from "./nba-prop-calibration";

export type NbaPropCalibrationHealth = {
  status: "GREEN" | "YELLOW" | "RED";
  generatedAt: string;
  hasDatabase: boolean;
  rowCount: number;
  bucketCount: number;
  healthyBucketCount: number;
  watchBucketCount: number;
  poorBucketCount: number;
  insufficientBucketCount: number;
  buckets: NbaPropCalibrationBucket[];
  lookup: NbaPropCalibrationLookup | null;
  blockers: string[];
  warnings: string[];
};

type DbPropCalibrationRow = {
  stat_key: string;
  confidence: number;
  predicted_over_probability: number;
  market_line: number;
  actual_value: number;
  closing_line: number | null;
  no_bet: boolean | null;
};

function toCalibrationRows(rows: DbPropCalibrationRow[]): NbaPropCalibrationRow[] {
  return rows.map((row) => ({
    statKey: row.stat_key,
    confidence: row.confidence,
    predictedOverProbability: row.predicted_over_probability,
    marketLine: row.market_line,
    actualValue: row.actual_value,
    closingLine: row.closing_line,
    noBet: row.no_bet
  }));
}

export async function getNbaPropCalibrationRows(limit = 5000): Promise<NbaPropCalibrationRow[]> {
  if (!hasUsableServerDatabaseUrl()) return [];
  try {
    const rows = await prisma.$queryRaw<DbPropCalibrationRow[]>`
      SELECT
        stat_key,
        confidence,
        predicted_over_probability,
        market_line,
        actual_value,
        closing_line,
        no_bet
      FROM nba_prop_prediction_snapshots
      WHERE graded_at IS NOT NULL
        AND actual_value IS NOT NULL
        AND market_line IS NOT NULL
        AND predicted_over_probability IS NOT NULL
      ORDER BY captured_at DESC
      LIMIT ${limit};
    `;
    return toCalibrationRows(rows);
  } catch {
    return [];
  }
}

function summarizeStatus(args: {
  hasDatabase: boolean;
  rowCount: number;
  buckets: NbaPropCalibrationBucket[];
  lookup: NbaPropCalibrationLookup | null;
}) {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const healthy = args.buckets.filter((bucket) => bucket.status === "HEALTHY").length;
  const poor = args.buckets.filter((bucket) => bucket.status === "POOR").length;
  const insufficient = args.buckets.filter((bucket) => bucket.status === "INSUFFICIENT").length;
  const watch = args.buckets.filter((bucket) => bucket.status === "WATCH").length;

  if (!args.hasDatabase) blockers.push("No usable DATABASE_URL; NBA prop calibration cannot be loaded.");
  if (args.rowCount === 0) blockers.push("No graded NBA prop calibration rows found.");
  if (args.lookup && args.lookup.status !== "HEALTHY") blockers.push(...args.lookup.blockerReasons.map((reason) => `Lookup blocked: ${reason}`));
  if (poor > 0) warnings.push(`${poor} NBA prop calibration bucket(s) are POOR.`);
  if (insufficient > 0) warnings.push(`${insufficient} NBA prop calibration bucket(s) are INSUFFICIENT.`);
  if (watch > 0) warnings.push(`${watch} NBA prop calibration bucket(s) are WATCH.`);

  const status: NbaPropCalibrationHealth["status"] = blockers.length
    ? "RED"
    : healthy > 0 && poor === 0
      ? watch > 0 || insufficient > 0 ? "YELLOW" : "GREEN"
      : "RED";

  return { status, blockers, warnings };
}

export async function getNbaPropCalibrationHealth(args?: {
  statKey?: string | null;
  confidence?: number | null;
  limit?: number;
}): Promise<NbaPropCalibrationHealth> {
  const hasDatabase = hasUsableServerDatabaseUrl();
  const rows = await getNbaPropCalibrationRows(args?.limit ?? 5000);
  const buckets = summarizeNbaPropCalibrationBuckets(rows);
  const statKey = args?.statKey ? normalizeNbaPropStatKey(args.statKey) : null;
  const lookup = statKey && typeof args?.confidence === "number" && Number.isFinite(args.confidence)
    ? lookupNbaPropCalibration({ buckets, statKey, confidence: args.confidence })
    : null;
  const counts = {
    healthyBucketCount: buckets.filter((bucket) => bucket.status === "HEALTHY").length,
    watchBucketCount: buckets.filter((bucket) => bucket.status === "WATCH").length,
    poorBucketCount: buckets.filter((bucket) => bucket.status === "POOR").length,
    insufficientBucketCount: buckets.filter((bucket) => bucket.status === "INSUFFICIENT").length
  };
  const summarized = summarizeStatus({ hasDatabase, rowCount: rows.length, buckets, lookup });

  return {
    status: summarized.status,
    generatedAt: new Date().toISOString(),
    hasDatabase,
    rowCount: rows.length,
    bucketCount: buckets.length,
    ...counts,
    buckets,
    lookup,
    blockers: summarized.blockers,
    warnings: summarized.warnings
  };
}
