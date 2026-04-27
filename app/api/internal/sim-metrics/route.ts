import { NextResponse } from "next/server";
import {
  getPredictionMetrics,
  getOpenPredictions
} from "@/services/simulation/sim-tracking-service";
import {
  calibrateSimulationByPropType,
  getTopEdgeOpportunities,
  getCalibrationBuckets
} from "@/services/simulation/sim-settlement-service";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const url = new URL(request.url);
    const league = url.searchParams.get("league") || undefined;
    const propType = url.searchParams.get("propType") || undefined;

    const [metrics, openCount, calibration, topEdges, buckets] = await Promise.all([
      getPredictionMetrics(league),
      getOpenPredictions().then((p) => p.length),
      calibrateSimulationByPropType(),
      getTopEdgeOpportunities(15),
      getCalibrationBuckets(propType)
    ]);

    return NextResponse.json({
      metrics: {
        ...metrics,
        openPredictions: openCount
      },
      calibration: propType ? { [propType]: calibration[propType] } : calibration,
      topEdges,
      confidenceBuckets: buckets,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Metrics fetch failed:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
