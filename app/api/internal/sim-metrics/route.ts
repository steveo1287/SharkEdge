import { NextResponse } from "next/server";
import {
  getPredictionMetrics,
  getOpenPredictions
} from "@/services/simulation/sim-tracking-service";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const url = new URL(request.url);
    const league = url.searchParams.get("league") || undefined;

    const [metrics, openCount] = await Promise.all([
      getPredictionMetrics(league),
      getOpenPredictions().then((p) => p.length)
    ]);

    return NextResponse.json({
      metrics: {
        ...metrics,
        openPredictions: openCount
      },
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
