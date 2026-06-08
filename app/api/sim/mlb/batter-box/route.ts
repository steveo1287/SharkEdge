import { NextResponse } from "next/server";

import { loadMlbBatterBoxProjection } from "@/services/simulation/mlb-batter-box-loader";
import { buildMlbSimulatedBoxScore } from "@/services/simulation/mlb-simulated-box-score";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function searchParamsToRecord(url: URL) {
  const out: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) out[key] = value;
  return out;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const result = await loadMlbBatterBoxProjection(searchParamsToRecord(url));
    const boxScore = result.projection ? buildMlbSimulatedBoxScore(result.projection) : null;
    return NextResponse.json({
      ok: Boolean(result.projection),
      modelVersion: "mlb-simulated-box-score-v2",
      boxScore,
      projection: result.projection,
      diagnostics: result.diagnostics,
      error: result.error
    }, { status: result.projection ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      modelVersion: "mlb-simulated-box-score-v2",
      boxScore: null,
      projection: null,
      diagnostics: null,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
