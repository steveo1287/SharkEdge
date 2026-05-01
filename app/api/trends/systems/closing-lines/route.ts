import { NextRequest, NextResponse } from "next/server";

import { updateTrendSystemClosingLines } from "@/services/trends/trend-system-closing-lines";

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
    return NextResponse.json({ ok: false, error: "Unauthorized trend system closing-line request." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "500");
    const run = await updateTrendSystemClosingLines({ limit: Number.isFinite(limit) ? limit : 500 });
    return NextResponse.json({
      ...run,
      nextAction: run.summary.updated
        ? "Closing/current odds were updated. Grade can now compute CLV when results are ready."
        : run.summary.skipped
          ? "No closing lines were updated. Inspect skipped reasons and make sure sim-market cache is warm."
          : "No open captured trend matches were available for closing-line update."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to update trend system closing lines."
    }, { status: 500 });
  }
}
