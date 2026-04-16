import { NextResponse } from "next/server";

import { listRecentCalibrationSummaries } from "@/services/calibration/calibration-summary-store";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 30), 100);
    const items = await listRecentCalibrationSummaries(limit);

    return NextResponse.json({
      ok: true,
      count: items.length,
      data: items.map((item) => ({
        id: item.id,
        summaryDate: item.summaryDate.toISOString(),
        scope: item.scope,
        sport: item.sport,
        marketType: item.marketType,
        modelVersion: item.modelVersion,
        thresholdConfig: item.thresholdConfigJson,
        metrics: item.metricsJson,
        flags: item.flagsJson,
        createdAt: item.createdAt.toISOString()
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load calibration summaries." },
      { status: 500 }
    );
  }
}
