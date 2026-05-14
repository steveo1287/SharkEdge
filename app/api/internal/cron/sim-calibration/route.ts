import { NextResponse } from "next/server";

import {
  fitAndPersistSimCalibrationProfiles,
  loadPersistedSimCalibrationProfiles
} from "@/services/simulation/sim-calibration-report-service";
import { trainBestAvailableMlbCalibrationConformal } from "@/services/simulation/mlb-calibration-conformal";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return false;
  }
  return bearer === cronSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const [result, mlbCalibration] = await Promise.all([
    fitAndPersistSimCalibrationProfiles(),
    trainBestAvailableMlbCalibrationConformal().catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : "MLB calibration training failed."
    }))
  ]);
  const loaded = await loadPersistedSimCalibrationProfiles();

  return NextResponse.json({
    ok: true,
    result,
    mlbCalibration,
    loadedLeagueCount: Object.keys(loaded).length
  });
}
