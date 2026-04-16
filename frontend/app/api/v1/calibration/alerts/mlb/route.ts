import { NextResponse } from "next/server";

import { getActiveCalibrationAlerts } from "@/services/calibration/calibration-actionability-service";

export async function GET() {
  try {
    const alerts = await getActiveCalibrationAlerts(100);
    const filtered = alerts.filter((alert: any) => {
      const key = String(alert?.metadata?.key ?? "");
      const title = String(alert?.title ?? "");
      return key.includes("MLB") || title.includes("MLB") || title.toLowerCase().includes("baseball");
    });

    return NextResponse.json({
      ok: true,
      count: filtered.length,
      data: filtered
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load MLB alerts." },
      { status: 500 }
    );
  }
}
