import { NextRequest, NextResponse } from "next/server";

import { capturePublishedTrendSystemMatches } from "@/services/trends/trend-system-capture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 180;

function authorized(request: NextRequest) {
  const expected =
    process.env.TRENDS_REFRESH_TOKEN?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    process.env.INTERNAL_API_KEY?.trim() ||
    process.env.INTERNAL_API_KEY2?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  const header = request.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
  return queryToken === expected || bearer === expected;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized trend system capture request." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const league = url.searchParams.get("league")?.trim().toUpperCase() || "ALL";
    const includeInactive = url.searchParams.get("inactive") === "true";
    const run = await capturePublishedTrendSystemMatches({ league, includeInactive });
    return NextResponse.json({
      ...run,
      nextAction: run.summary.capturedMatches
        ? "Published trend system matches were captured. They can now be graded later through the saved trend ledger."
        : run.summary.skippedMatches
          ? "System definitions were captured, but active matches could not be tied to Event rows. Sync/ingest events before capture."
          : "System definitions/snapshots were captured. No active system matches on the current slate."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to capture published trend system matches."
    }, { status: 500 });
  }
}
