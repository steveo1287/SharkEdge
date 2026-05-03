import { prisma } from "@/lib/db/prisma";
import { getUfcProviderReadiness } from "@/services/ufc/provider-adapters";

export async function getUfcOperationalStatus(modelVersion = "ufc-fight-iq-v1") {
  const [predictionRows, shadowRows, calibrationRows] = await Promise.all([
    prisma.$queryRaw<Array<{ last_generated_at: Date | string | null; prediction_count: bigint | number }>>`
      SELECT max(generated_at) AS last_generated_at, count(*) AS prediction_count
      FROM ufc_predictions
      WHERE model_version = ${modelVersion}
    `,
    prisma.$queryRaw<Array<{ pending_count: bigint | number; resolved_count: bigint | number }>>`
      SELECT
        count(*) FILTER (WHERE status = 'PENDING') AS pending_count,
        count(*) FILTER (WHERE status = 'RESOLVED') AS resolved_count
      FROM ufc_shadow_predictions
      WHERE model_version = ${modelVersion}
    `,
    prisma.$queryRaw<Array<{ generated_at: Date | string | null; accuracy_pct: number | null; log_loss: number | null; brier_score: number | null; calibration_error: number | null }>>`
      SELECT generated_at, accuracy_pct, log_loss, brier_score, calibration_error
      FROM ufc_calibration_snapshots
      WHERE model_version = ${modelVersion}
      ORDER BY generated_at DESC
      LIMIT 1
    `
  ]);

  const predictions = predictionRows[0];
  const shadow = shadowRows[0];
  const calibration = calibrationRows[0] ?? null;
  return {
    ok: true,
    modelVersion,
    providerReadiness: getUfcProviderReadiness(),
    lastPredictionGeneratedAt: predictions?.last_generated_at ? new Date(predictions.last_generated_at).toISOString() : null,
    predictionCount: Number(predictions?.prediction_count ?? 0),
    shadowPendingCount: Number(shadow?.pending_count ?? 0),
    shadowResolvedCount: Number(shadow?.resolved_count ?? 0),
    latestCalibration: calibration ? {
      generatedAt: calibration.generated_at ? new Date(calibration.generated_at).toISOString() : null,
      accuracyPct: calibration.accuracy_pct,
      logLoss: calibration.log_loss,
      brierScore: calibration.brier_score,
      calibrationError: calibration.calibration_error
    } : null
  };
}
