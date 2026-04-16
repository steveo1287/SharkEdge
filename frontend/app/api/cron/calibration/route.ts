import { NextResponse } from "next/server";

import { getLatestDailyCalibrationSummary, writeDailyCalibrationSummary } from "@/services/calibration/daily-calibration-summary-service";

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return true;
  }
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await writeDailyCalibrationSummary();
    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Calibration cron failed." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}

export async function HEAD() {
  return new Response(null, { status: 200 });
}
