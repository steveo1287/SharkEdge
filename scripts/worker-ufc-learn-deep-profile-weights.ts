import crypto from "node:crypto";

import { prisma } from "@/lib/db/prisma";
import { buildUfcDeepProfileLearnedWeights, type UfcDeepProfileLearnedWeights } from "@/services/ufc/deep-profile-weight-store";
import type { UfcDeepProfileCalibrationReport } from "@/services/ufc/deep-profile-calibration";

type ReportRow = { report_json: unknown; calibration_error: number | null; generated_at: Date | string | null };

function argValue(name: string) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

function hasFlag(name: string) {
  return process.argv.includes(`--${name}`);
}

function numberArg(name: string, fallback: number) {
  const value = argValue(name);
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid numeric arg --${name}=${value}`);
  return parsed;
}

function stableId(prefix: string, value: string) {
  return `${prefix}_${crypto.createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
}

function parseReport(row: ReportRow): UfcDeepProfileCalibrationReport | null {
  if (!row.report_json || typeof row.report_json !== "object") return null;
  const report = row.report_json as Partial<UfcDeepProfileCalibrationReport>;
  if (report.modelVersion !== "ufc-deep-profile-calibration-v1" || !report.scores || !Array.isArray(report.adjustments)) return null;
  return report as UfcDeepProfileCalibrationReport;
}

async function loadReports(limit: number) {
  const rows = await prisma.$queryRaw<ReportRow[]>`
    SELECT report_json, calibration_error, generated_at
    FROM ufc_deep_profile_calibration_reports
    ORDER BY generated_at DESC
    LIMIT ${limit}
  `;
  return rows.map(parseReport).filter((report): report is UfcDeepProfileCalibrationReport => Boolean(report));
}

async function persistWeights(weights: UfcDeepProfileLearnedWeights) {
  const id = stableId("ufcdpw", weights.modelVersion);
  await prisma.$executeRaw`
    INSERT INTO ufc_deep_profile_learned_weights (
      id, model_version, generated_at, report_count, avg_calibration_error, high_miss_count,
      weights_json, summary, updated_at
    ) VALUES (
      ${id}, ${weights.modelVersion}, ${weights.generatedAt}::timestamptz, ${weights.reportCount}, ${weights.avgCalibrationError}, ${weights.highMissCount},
      ${JSON.stringify(weights)}::jsonb, ${weights.summary}, now()
    )
    ON CONFLICT (model_version) DO UPDATE SET
      generated_at = EXCLUDED.generated_at,
      report_count = EXCLUDED.report_count,
      avg_calibration_error = EXCLUDED.avg_calibration_error,
      high_miss_count = EXCLUDED.high_miss_count,
      weights_json = EXCLUDED.weights_json,
      summary = EXCLUDED.summary,
      updated_at = now()
  `;
  return id;
}

async function main() {
  const limit = numberArg("limit", 500);
  const persist = hasFlag("persist");
  const compact = hasFlag("compact");
  const generatedAt = argValue("generatedAt") ?? new Date().toISOString();
  const reports = await loadReports(limit);
  const weights = buildUfcDeepProfileLearnedWeights(reports, generatedAt);
  const persistedId = persist ? await persistWeights(weights) : null;
  const payload = {
    ok: true,
    command: "worker-ufc-learn-deep-profile-weights",
    persist,
    persistedId,
    reportCount: weights.reportCount,
    avgCalibrationError: weights.avgCalibrationError,
    highMissCount: weights.highMissCount,
    confidence: weights.confidence,
    summary: weights.summary,
    weights: compact ? {
      phaseWeights: weights.phaseWeights,
      methodPriors: weights.methodPriors,
      confidenceCaps: weights.confidenceCaps,
      adjustmentCounts: weights.adjustmentCounts,
      sourceSummary: weights.sourceSummary
    } : weights
  };
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, command: "worker-ufc-learn-deep-profile-weights", error: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
});
