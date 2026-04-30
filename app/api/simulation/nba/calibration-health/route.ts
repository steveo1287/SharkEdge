import { NextResponse } from "next/server";

import { getOrTrainNbaLearnedCalibrator } from "@/services/simulation/nba-learned-calibrator";
import { getOrTrainNbaPickHistoryTuner } from "@/services/simulation/nba-pick-history-tuner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const learned = await getOrTrainNbaLearnedCalibrator();
    const tuner = await getOrTrainNbaPickHistoryTuner();

    return NextResponse.json({
      ok: learned.ok || tuner.ok,
      generatedAt: new Date().toISOString(),
      learned: {
        ok: learned.ok,
        source: learned.source,
        rows: learned.rows,
        usableMarketRows: learned.usableMarketRows,
        global: learned.global,
        sourceWeights: learned.sourceWeights,
        warning: learned.warning
      },
      tuner: {
        ok: tuner.ok,
        source: tuner.source,
        rows: tuner.rows,
        usableMarketRows: tuner.usableMarketRows,
        global: tuner.global,
        sourceWeights: tuner.sourceWeights,
        warning: tuner.warning
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "NBA calibration health check failed." }, { status: 500 });
  }
}
