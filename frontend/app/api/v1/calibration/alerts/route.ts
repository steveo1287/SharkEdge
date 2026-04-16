import { NextResponse } from "next/server";

import { getActiveCalibrationAlerts } from "@/services/calibration/calibration-actionability-service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);
    const alerts = await getActiveCalibrationAlerts(limit);

    return NextResponse.json({
      ok: true,
      count: alerts.length,
      data: alerts
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load calibration alerts." },
      { status: 500 }
    );
  }
}
