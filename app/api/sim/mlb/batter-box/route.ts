import { NextResponse } from "next/server";

import { loadMlbBatterBoxProjection } from "@/services/simulation/mlb-batter-box-loader";

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
    return NextResponse.json({
      ok: Boolean(result.projection),
      modelVersion: "mlb-batter-box-loader-v1",
      projection: result.projection,
      diagnostics: result.diagnostics,
      error: result.error
    }, { status: result.projection ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      modelVersion: "mlb-batter-box-loader-v1",
      projection: null,
      diagnostics: null,
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}
