import { NextResponse } from "next/server";

import { getOrTrainNbaLearnedCalibrator } from "@/services/simulation/nba-learned-calibrator";
import { getOrTrainNbaPickHistoryTuner } from "@/services/simulation/nba-pick-history-tuner";
import { buildNbaSimHealthPolicy, summarizeNbaSimHealthPolicy } from "@/services/simulation/nba-sim-health-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const learned = await getOrTrainNbaLearnedCalibrator();
    const tuner = await getOrTrainNbaPickHistoryTuner();
    const usableMarketRows = Math.max(learned.usableMarketRows ?? 0, tuner.usableMarketRows ?? 0);
    const sourceHealth = learned.ok && tuner.ok && usableMarketRows >= 100 ? "GREEN" : learned.ok || tuner.ok || usableMarketRows > 0 ? "YELLOW" : "RED";
    const calibrationBucketHealthy = Boolean(
      tuner.ok &&
      tuner.buckets?.all?.action !== "pass" &&
      (typeof tuner.global?.modelBrierEdge !== "number" || tuner.global.modelBrierEdge >= 0)
    );
    const policy = buildNbaSimHealthPolicy({
      diagnostics: null,
      sourceHealth,
      injuryReportFresh: null,
      starQuestionable: null,
      calibrationBucketHealthy
    });

    return NextResponse.json({
      ok: learned.ok || tuner.ok,
      generatedAt: new Date().toISOString(),
      policy,
      policySummary: summarizeNbaSimHealthPolicy(policy),
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
