import { NextResponse } from "next/server";

import { fetchPersistedMlbPlayerPropCalibrationRows, refreshMlbPlayerPropCalibrationSnapshots } from "@/services/simulation/mlb-player-prop-calibration-persistence";
import { buildMlbPlayerPropBacktestReport } from "@/services/simulation/mlb-player-prop-calibration-backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function numberParam(url: URL, key: string, fallback: number) {
  const raw = url.searchParams.get(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const lookbackDays = numberParam(url, "lookbackDays", 365);
    const minBinSample = numberParam(url, "minBinSample", 25);
    const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
    const rows = await fetchPersistedMlbPlayerPropCalibrationRows({ lookbackDays });
    const backtest = buildMlbPlayerPropBacktestReport(rows);
    const refreshReport = refresh ? await refreshMlbPlayerPropCalibrationSnapshots({ lookbackDays, minBinSample, persist: true }) : null;

    return NextResponse.json({
      ok: true,
      modelVersion: "mlb-player-prop-calibration-dashboard-v1",
      lookbackDays,
      minBinSample,
      rowCount: rows.length,
      backtest,
      refreshReport
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      modelVersion: "mlb-player-prop-calibration-dashboard-v1",
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
