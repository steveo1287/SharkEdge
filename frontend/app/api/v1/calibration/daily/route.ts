import { NextResponse } from "next/server";

import { getLatestDailyCalibrationSummary } from "@/services/calibration/daily-calibration-summary-service";

export async function GET() {
  try {
    const summary = await getLatestDailyCalibrationSummary();
    return NextResponse.json({
      ok: true,
      summary
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch latest daily calibration summary." },
      { status: 500 }
    );
  }
}
