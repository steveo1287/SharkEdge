import { NextResponse } from "next/server";
import { autoTuneAllPropTypes, getCurrentTuningStats } from "@/services/simulation/sim-auto-tuner";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    console.log("Starting auto-tune job...");

    const results = await autoTuneAllPropTypes();
    const stats = await getCurrentTuningStats();

    return NextResponse.json({
      success: true,
      message: "Auto-tuning completed successfully",
      results,
      currentStats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Auto-tune job failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
