import { NextResponse } from "next/server";

import { getNbaPropCalibrationHealth } from "@/services/simulation/nba-prop-calibration-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseConfidence(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statKey = url.searchParams.get("statKey") ?? url.searchParams.get("stat") ?? null;
    const confidence = parseConfidence(url.searchParams.get("confidence"));
    const limit = Number(url.searchParams.get("limit") ?? 5000);
    const health = await getNbaPropCalibrationHealth({
      statKey,
      confidence,
      limit: Number.isFinite(limit) ? Math.max(100, Math.min(10000, limit)) : 5000
    });

    return NextResponse.json({
      ok: true,
      ...health,
      query: {
        statKey,
        confidence,
        lookupRequested: Boolean(statKey && confidence !== null)
      },
      actionRule: "Only HEALTHY statKey+confidence buckets should clear NBA prop noBet. WATCH/POOR/INSUFFICIENT must force WATCH/PASS with Kelly 0.",
      examples: {
        points: "/api/simulation/nba/prop-calibration?statKey=points&confidence=0.72",
        rebounds: "/api/simulation/nba/prop-calibration?statKey=rebounds&confidence=0.68"
      }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      status: "RED",
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "NBA prop calibration route failed.",
      actionRule: "Route failure must be treated as prop calibration unavailable: force noBet and Kelly 0."
    }, { status: 500 });
  }
}
