import { NextRequest, NextResponse } from "next/server";

import { gradeCapturedTrendSystemMatches } from "@/services/trends/trend-system-grader";

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
    return NextResponse.json({ ok: false, error: "Unauthorized trend system grade request." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const run = await gradeCapturedTrendSystemMatches({ limit: Number.isFinite(limit) ? limit : 200 });
    return NextResponse.json({
      ...run,
      nextAction: run.summary.gradedMatches
        ? "Captured trend matches were graded and fresh snapshots were written."
        : run.summary.skippedOpen
          ? "Some matches had EventResult rows but could not be graded. Inspect skipped reasons."
          : "No captured open trend matches with EventResult rows were ready to grade."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to grade captured trend system matches."
    }, { status: 500 });
  }
}
