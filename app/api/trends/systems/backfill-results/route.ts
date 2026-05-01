import { NextRequest, NextResponse } from "next/server";

import { backfillTrendSystemEventResults } from "@/services/trends/trend-system-result-backfill";
import { gradeCapturedTrendSystemMatches, inspectTrendSystemGradeQueue } from "@/services/trends/trend-system-grader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

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
    return NextResponse.json({ ok: false, error: "Unauthorized trend result backfill request." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = readLimit(request);
    const gradeAfter = url.searchParams.get("grade") !== "false";
    const before = await inspectTrendSystemGradeQueue({ limit });
    const backfill = await backfillTrendSystemEventResults({ limit });
    const grade = gradeAfter ? await gradeCapturedTrendSystemMatches({ limit }) : null;
    const after = await inspectTrendSystemGradeQueue({ limit });

    return NextResponse.json({
      ok: Boolean(backfill.ok && (!gradeAfter || grade?.ok)),
      generatedAt: new Date().toISOString(),
      limit,
      gradeAfter,
      before,
      backfill,
      grade,
      after,
      nextAction: grade?.summary.gradedMatches
        ? "Result backfill and grading completed. Refresh /trends and cache health."
        : after.summary?.gradeableWithEventResult
          ? "Final results are present for some rows. Run grade endpoint again or inspect skipped buckets."
          : after.summary?.missingEventResult
            ? "Rows are still blocked by missing EventResult after provider refresh. Check provider coverage and event mapping."
            : "Backfill completed; inspect queue buckets for remaining blockers."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to backfill trend event results."
    }, { status: 500 });
  }
}
