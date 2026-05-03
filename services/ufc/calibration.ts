import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { americanOddsToImpliedProbability } from "@/services/ufc/fight-iq";

export type UfcCalibrationInput = {
  fightId: string;
  modelVersion: string;
  fighterAWinProbability: number;
  actualWinner: "A" | "B";
  pickSide?: "A" | "B";
  marketOddsAOpen?: number | null;
  marketOddsAClose?: number | null;
};

export type UfcCalibrationBucket = {
  bucket: string;
  count: number;
  avgPredicted: number;
  actualRate: number;
  calibrationError: number;
};

export type UfcCalibrationReport = {
  count: number;
  accuracyPct: number;
  logLoss: number;
  brierScore: number;
  calibrationError: number;
  avgClvPct: number | null;
  buckets: UfcCalibrationBucket[];
};

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function clampProbability(value: number) {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0.001, Math.min(0.999, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function bucketFor(probability: number) {
  const floor = Math.floor(probability * 10) / 10;
  const lower = Math.max(0, Math.min(0.9, floor));
  return `${lower.toFixed(1)}-${(lower + 0.1).toFixed(1)}`;
}

function clvPct(openOdds: number | null | undefined, closeOdds: number | null | undefined) {
  const open = americanOddsToImpliedProbability(openOdds);
  const close = americanOddsToImpliedProbability(closeOdds);
  if (open == null || close == null) return null;
  return round((close - open) * 100, 2);
}

export function calculateUfcCalibrationReport(rows: UfcCalibrationInput[]): UfcCalibrationReport {
  if (!rows.length) {
    return { count: 0, accuracyPct: 0, logLoss: 0, brierScore: 0, calibrationError: 0, avgClvPct: null, buckets: [] };
  }

  let correct = 0;
  let logLoss = 0;
  let brier = 0;
  const clvValues: number[] = [];
  const buckets = new Map<string, { count: number; predicted: number; actual: number }>();

  for (const row of rows) {
    const pA = clampProbability(row.fighterAWinProbability);
    const actualA = row.actualWinner === "A" ? 1 : 0;
    const pickSide = row.pickSide ?? (pA >= 0.5 ? "A" : "B");
    if (pickSide === row.actualWinner) correct += 1;
    logLoss += -(actualA * Math.log(pA) + (1 - actualA) * Math.log(1 - pA));
    brier += Math.pow(pA - actualA, 2);
    const bucket = bucketFor(pA);
    const current = buckets.get(bucket) ?? { count: 0, predicted: 0, actual: 0 };
    current.count += 1;
    current.predicted += pA;
    current.actual += actualA;
    buckets.set(bucket, current);

    const clv = clvPct(row.marketOddsAOpen, row.marketOddsAClose);
    if (clv != null) clvValues.push(clv);
  }

  const bucketReports = [...buckets.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([bucket, item]) => {
    const avgPredicted = item.predicted / item.count;
    const actualRate = item.actual / item.count;
    return {
      bucket,
      count: item.count,
      avgPredicted: round(avgPredicted),
      actualRate: round(actualRate),
      calibrationError: round(Math.abs(avgPredicted - actualRate))
    };
  });

  const weightedCalibrationError = bucketReports.reduce((sum, bucket) => sum + bucket.calibrationError * bucket.count, 0) / rows.length;
  return {
    count: rows.length,
    accuracyPct: round((correct / rows.length) * 100, 2),
    logLoss: round(logLoss / rows.length, 5),
    brierScore: round(brier / rows.length, 5),
    calibrationError: round(weightedCalibrationError, 5),
    avgClvPct: clvValues.length ? round(clvValues.reduce((sum, value) => sum + value, 0) / clvValues.length, 2) : null,
    buckets: bucketReports
  };
}

export async function persistUfcCalibrationSnapshot(modelVersion: string, snapshotLabel = "shadow-mode") {
  const rows = await prisma.$queryRaw<Array<{
    fight_id: string;
    model_version: string;
    fighter_a_win_probability: number;
    fighter_a_id: string;
    fighter_b_id: string;
    pick_fighter_id: string | null;
    actual_winner_fighter_id: string | null;
    market_odds_a_open: number | null;
    market_odds_a_close: number | null;
  }>>`
    SELECT s.fight_id, s.model_version, s.fighter_a_win_probability, f.fighter_a_id, f.fighter_b_id,
      s.pick_fighter_id, s.actual_winner_fighter_id, s.market_odds_a_open, s.market_odds_a_close
    FROM ufc_shadow_predictions s
    JOIN ufc_fights f ON f.id = s.fight_id
    WHERE s.model_version = ${modelVersion}
      AND s.actual_winner_fighter_id IS NOT NULL
  `;

  const report = calculateUfcCalibrationReport(rows.map((row) => ({
    fightId: row.fight_id,
    modelVersion: row.model_version,
    fighterAWinProbability: row.fighter_a_win_probability,
    actualWinner: row.actual_winner_fighter_id === row.fighter_a_id ? "A" : "B",
    pickSide: row.pick_fighter_id === row.fighter_a_id ? "A" : "B",
    marketOddsAOpen: row.market_odds_a_open,
    marketOddsAClose: row.market_odds_a_close
  })));

  const id = stableId("ufccal", `${modelVersion}:${snapshotLabel}:${new Date().toISOString()}`);
  await prisma.$executeRaw`
    INSERT INTO ufc_calibration_snapshots (id, model_version, snapshot_label, generated_at, fight_count, accuracy_pct, log_loss, brier_score, calibration_error, avg_clv_pct, bucket_json, metrics_json, updated_at)
    VALUES (${id}, ${modelVersion}, ${snapshotLabel}, now(), ${report.count}, ${report.accuracyPct}, ${report.logLoss}, ${report.brierScore}, ${report.calibrationError}, ${report.avgClvPct}, ${JSON.stringify(report.buckets)}::jsonb, ${JSON.stringify(report)}::jsonb, now())
  `;

  return { id, report };
}
