import { NextRequest, NextResponse } from "next/server";

import { gradeCapturedTrendSystemMatches, inspectTrendSystemGradeQueue } from "@/services/trends/trend-system-grader";

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

function readLimit(request: NextRequest) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? "500");
  return Math.min(Math.max(Number.isFinite(limit) ? limit : 500, 1), 1000);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized trend system grade request." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = readLimit(request);
    const inspectOnly = url.searchParams.get("inspect") === "true";
    if (inspectOnly) {
      return NextResponse.json(await inspectTrendSystemGradeQueue({ limit }));
    }
    const run = await gradeCapturedTrendSystemMatches({ limit });
    return NextResponse.json({
      ...run,
      nextAction: run.summary.gradedMatches
        ? "Captured trend matches were graded and fresh snapshots were written."
        : run.summary.gradeableWithEventResult
          ? "Rows had EventResult data but still could not be fully graded. Inspect skipped reasons and queue buckets."
          : run.summary.totalOpenSystemMatches
            ? "Open captured trend matches exist but are blocked by missing EventResult or mapping data. Run inspect=true to see buckets."
            : "No captured open trend matches are waiting for grading."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to grade captured trend system matches."
    }, { status: 500 });
  }
}
