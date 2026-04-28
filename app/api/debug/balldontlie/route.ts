import { NextResponse } from "next/server";

import { getBallDontLieDebugPayload } from "@/services/nba/balldontlie-player-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload = await getBallDontLieDebugPayload();
  return NextResponse.json({
    ok: payload.configured && payload.fetched && payload.normalizedCount > 0,
    ...payload,
    interpretation: !payload.configured
      ? "BALLDONTLIE_API_KEY is not configured in the runtime environment."
      : payload.fetched && payload.normalizedCount > 0
        ? "balldontlie player and season-average data are flowing into the SharkEdge NBA player feed normalizer."
        : "balldontlie did not return usable normalized player stats. Check auth, tier access, endpoint shape, and season."
  });
}
