import { buildSegmentedCalibrationReport } from "@/services/calibration/edge-calibration-report";
import { thresholdConfig, TARGET_WINNER_ACCURACY, getThresholdRule } from "@/services/calibration/calibration-thresholds";
import { persistCalibrationSummary } from "@/services/calibration/calibration-summary-store";
import { writeCalibrationAlerts } from "@/services/calibration/calibration-alert-service";
import { capturePreLockCloseLines } from "@/services/calibration/close-line-capture-service";
import { resolveEdgeSnapshotsFromResults } from "@/services/calibration/edge-resolution-service";
import { snapshotActiveEdgeExplanations } from "@/services/calibration/edge-calibration-service";

type SegmentMetric = {
  key: string;
  sampleSize: number;
  brier: number;
  logLoss: number;
  averageClvPercent: number | null;
  hitRate: number;
};

function evaluateSegment(kind: string, sport: string | null, metric: SegmentMetric) {
  const rule = getThresholdRule(sport);
  const flags = [];

  if (metric.sampleSize < rule.minSampleSize) {
    return flags;
  }

  if (metric.brier > rule.maxBrier) {
    flags.push({
      severity: "critical" as const,
      title: `${kind} ${metric.key} failing Brier`,
      detail: `Observed ${metric.brier}, threshold ${rule.maxBrier}.`,
      metadata: { kind, key: metric.key, metric: "brier", observed: metric.brier, threshold: rule.maxBrier, sport }
    });
  }

  if (metric.logLoss > rule.maxLogLoss) {
    flags.push({
      severity: "warning" as const,
      title: `${kind} ${metric.key} high log loss`,
      detail: `Observed ${metric.logLoss}, threshold ${rule.maxLogLoss}.`,
      metadata: { kind, key: metric.key, metric: "logLoss", observed: metric.logLoss, threshold: rule.maxLogLoss, sport }
    });
  }

  if (metric.averageClvPercent !== null && metric.averageClvPercent < rule.minAverageClvPercent) {
    flags.push({
      severity: "warning" as const,
      title: `${kind} ${metric.key} losing to close`,
      detail: `Observed CLV ${metric.averageClvPercent}, threshold ${rule.minAverageClvPercent}.`,
      metadata: { kind, key: metric.key, metric: "averageClvPercent", observed: metric.averageClvPercent, threshold: rule.minAverageClvPercent, sport }
    });
  }

  if (metric.hitRate < rule.minHitRate) {
    flags.push({
      severity: "warning" as const,
      title: `${kind} ${metric.key} under hit-rate floor`,
      detail: `Observed ${metric.hitRate}, threshold ${rule.minHitRate}.`,
      metadata: { kind, key: metric.key, metric: "hitRate", observed: metric.hitRate, threshold: rule.minHitRate, sport }
    });
  }

  return flags;
}

function evaluateQualifiedWinnerTarget(metric: SegmentMetric) {
  if (metric.sampleSize < 40) return [];
  if (metric.hitRate >= TARGET_WINNER_ACCURACY) return [];
  return [{
    severity: "info" as const,
    title: `Qualified winner bucket below 70% target`,
    detail: `Observed ${metric.hitRate}; target ${TARGET_WINNER_ACCURACY}.`,
    metadata: { kind: "winner_target", key: metric.key, observed: metric.hitRate, target: TARGET_WINNER_ACCURACY }
  }];
}

export async function runCalibrationOpsPass() {
  await snapshotActiveEdgeExplanations();
  await capturePreLockCloseLines();
  await resolveEdgeSnapshotsFromResults();

  const report = await buildSegmentedCalibrationReport();
  const summaryDate = new Date();
  const alerts = [];

  await persistCalibrationSummary({
    summaryDate,
    scope: "overall",
    thresholdConfigJson: thresholdConfig.overall,
    metricsJson: report.overall,
    flagsJson: []
  });

  for (const metric of report.bySport) {
    const sportFlags = evaluateSegment("sport", metric.key, metric as SegmentMetric);
    alerts.push(...sportFlags);
    await persistCalibrationSummary({
      summaryDate,
      scope: "sport",
      sport: metric.key,
      thresholdConfigJson: getThresholdRule(metric.key),
      metricsJson: metric,
      flagsJson: sportFlags
    });
  }

  for (const metric of report.byMarketType) {
    const marketFlags = evaluateSegment("market_type", null, metric as SegmentMetric);
    alerts.push(...marketFlags);
    await persistCalibrationSummary({
      summaryDate,
      scope: "market_type",
      marketType: metric.key,
      thresholdConfigJson: thresholdConfig.overall,
      metricsJson: metric,
      flagsJson: marketFlags
    });
  }

  for (const metric of report.byModelVersion) {
    const modelFlags = evaluateSegment("model_version", null, metric as SegmentMetric);
    alerts.push(...modelFlags);
    await persistCalibrationSummary({
      summaryDate,
      scope: "model_version",
      modelVersion: metric.key,
      thresholdConfigJson: thresholdConfig.overall,
      metricsJson: metric,
      flagsJson: modelFlags
    });
  }

  for (const metric of report.byConfidenceBucket) {
    const confidenceFlags = evaluateQualifiedWinnerTarget(metric as SegmentMetric);
    alerts.push(...confidenceFlags);
    await persistCalibrationSummary({
      summaryDate,
      scope: "confidence_bucket",
      thresholdConfigJson: thresholdConfig.overall,
      metricsJson: metric,
      flagsJson: confidenceFlags
    });
  }

  for (const metric of report.byFactorBucket) {
    const factorFlags = evaluateSegment("factor_bucket", null, metric as SegmentMetric);
    alerts.push(...factorFlags);
    await persistCalibrationSummary({
      summaryDate,
      scope: "factor_bucket",
      thresholdConfigJson: thresholdConfig.overall,
      metricsJson: metric,
      flagsJson: factorFlags
    });
  }

  await writeCalibrationAlerts(alerts);

  return {
    generatedAt: summaryDate.toISOString(),
    alertCount: alerts.length,
    alerts
  };
}
