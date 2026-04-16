import { NextResponse } from "next/server";

import { deliverCriticalCalibrationNotifications } from "@/services/calibration/notification-delivery-service";

export async function POST() {
  try {
    const result = await deliverCriticalCalibrationNotifications();
    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to deliver calibration notifications." },
      { status: 500 }
    );
  }
}
