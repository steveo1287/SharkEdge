import { NextResponse } from "next/server";

import { hardenNbaWinnerBucket } from "@/services/simulation/nba-winner-calibration-hardening";
import { getNbaWinnerAdvancedCalibrationReport } from "@/services/simulation/nba-winner-calibration-metrics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "5000");
  const report = await getNbaWinnerAdvancedCalibrationReport({ limit: Number.isFinite(limit) ? limit : 5000 });
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    reportStatus: report.status,
    rowCount: report.rowCount,
    gradedCount: report.gradedCount,
    pickCount: report.pickCount,
    passCount: report.passCount,
    buckets: report.buckets.map((bucket) => ({
      bucket: bucket.bucket,
      sampleSize: bucket.sampleSize,
      status: bucket.status,
      hitRate: bucket.hitRate,
      marketExpectedHitRate: bucket.marketExpectedHitRate,
      avgClvPct: bucket.avgClvPct,
      clvBeatRate: bucket.clvBeatRate,
      brierEdge: bucket.brierEdge,
      logLossEdge: bucket.logLossEdge,
      calibrationError: bucket.calibrationError,
      roi: bucket.roi,
      proof: hardenNbaWinnerBucket(bucket)
    })),
    blockers: report.blockers,
    warnings: report.warnings
  });
}
