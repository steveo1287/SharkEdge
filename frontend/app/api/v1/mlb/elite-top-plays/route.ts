import { NextResponse } from "next/server";

import { getEdgesApi } from "@/services/feed/feed-api";

export async function GET() {
  try {
    const payload = (await getEdgesApi()) as { data?: unknown[] };
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const mlbPlays = rows
      .filter((item: any) => item.league === "MLB" && item.mlbEliteSnapshot && item.decisionFusion?.calibratedTier !== "pass" && item.decisionFusion?.suppressionReason == null && item.mlbPromotionDecision?.tier !== "pass" && item.mlbPromotionDecision?.isSuppressed !== true)
      .sort((left: any, right: any) => (right.adjustedRankSignal ?? 0) - (left.adjustedRankSignal ?? 0))
      .slice(0, 10);

    return NextResponse.json({
      ok: true,
      count: mlbPlays.length,
      data: mlbPlays
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load MLB elite top plays." },
      { status: 500 }
    );
  }
}
