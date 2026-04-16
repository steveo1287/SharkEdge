import { NextResponse } from "next/server";

import { computeEdgeCalibrationReport, snapshotActiveEdgeExplanations } from "@/services/calibration/edge-calibration-service";
import { buildSegmentedCalibrationReport } from "@/services/calibration/edge-calibration-report";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") ?? "report";

    if (mode === "snapshot") {
      const result = await snapshotActiveEdgeExplanations();
      return NextResponse.json({
        ok: true,
        mode,
        ...result
      });
    }

    if (mode === "segmented") {
      const report = await buildSegmentedCalibrationReport();
      return NextResponse.json(report);
    }

    const report = await computeEdgeCalibrationReport();
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load edge calibration report." },
      { status: 500 }
    );
  }
}
