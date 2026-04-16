import { prisma } from "@/lib/db/prisma";

import { buildSegmentedCalibrationReport } from "@/services/calibration/edge-calibration-report";
import { resolveEdgeSnapshotsFromResults } from "@/services/calibration/edge-resolution-service";
import { snapshotActiveEdgeExplanations } from "@/services/calibration/edge-calibration-service";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

type Flag = {
  type: "factor_bucket" | "model_version" | "confidence_bucket";
  key: string;
  reason: string;
  severity: "info" | "warning" | "critical";
};

function buildFlags(report: Awaited<ReturnType<typeof buildSegmentedCalibrationReport>>) {
  const flags: Flag[] = [];

  for (const bucket of report.byFactorBucket) {
    if (bucket.sampleSize >= 25 && bucket.averageClvPercent !== null && bucket.averageClvPercent < -1.5) {
      flags.push({
        type: "factor_bucket",
        key: bucket.key,
        reason: `Negative CLV drift (${bucket.averageClvPercent}%).`,
        severity: "warning"
      });
    }
    if (bucket.sampleSize >= 25 && bucket.brier > 0.28) {
      flags.push({
        type: "factor_bucket",
        key: bucket.key,
        reason: `Poor calibration (Brier ${bucket.brier}).`,
        severity: "critical"
      });
    }
  }

  for (const model of report.byModelVersion) {
    if (model.sampleSize >= 25 && model.brier > 0.27) {
      flags.push({
        type: "model_version",
        key: model.key,
        reason: `Model version is degrading on Brier (${model.brier}).`,
        severity: "critical"
      });
    }
    if (model.sampleSize >= 25 && model.averageClvPercent !== null && model.averageClvPercent < -1) {
      flags.push({
        type: "model_version",
        key: model.key,
        reason: `Model version is losing to the close (${model.averageClvPercent}%).`,
        severity: "warning"
      });
    }
  }

  for (const bucket of report.byConfidenceBucket) {
    if (bucket.sampleSize >= 20 && bucket.hitRate + 0.08 < (Number(bucket.key.split("-")[0]) / 100)) {
      flags.push({
        type: "confidence_bucket",
        key: bucket.key,
        reason: `Confidence bucket is overconfident (hit rate ${bucket.hitRate}).`,
        severity: "warning"
      });
    }
  }

  return flags;
}

export async function writeDailyCalibrationSummary() {
  await snapshotActiveEdgeExplanations();
  await resolveEdgeSnapshotsFromResults();

  const report = await buildSegmentedCalibrationReport();
  const flags = buildFlags(report);

  const created = await prisma.importBatch.create({
    data: {
      source: "calibration_daily_summary",
      status: "COMPLETED",
      startedAt: new Date(),
      finishedAt: new Date(),
      metadataJson: {
        type: "daily_calibration_summary",
        report,
        flags
      }
    },
    select: {
      id: true,
      metadataJson: true,
      createdAt: true
    }
  });

  return {
    summaryId: created.id,
    createdAt: created.createdAt.toISOString(),
    flags
  };
}

export async function getLatestDailyCalibrationSummary() {
  const latest = await prisma.importBatch.findFirst({
    where: {
      source: "calibration_daily_summary",
      status: "COMPLETED"
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      createdAt: true,
      metadataJson: true
    }
  });

  if (!latest) {
    return null;
  }

  const metadata = asObject(latest.metadataJson) ?? {};
  return {
    id: latest.id,
    createdAt: latest.createdAt.toISOString(),
    report: metadata.report ?? null,
    flags: metadata.flags ?? []
  };
}
