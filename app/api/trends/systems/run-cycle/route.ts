import { NextRequest, NextResponse } from "next/server";

import { capturePublishedTrendSystemMatches } from "@/services/trends/trend-system-capture";
import { updateTrendSystemClosingLines } from "@/services/trends/trend-system-closing-lines";
import { gradeCapturedTrendSystemMatches } from "@/services/trends/trend-system-grader";
import { buildTrendSystemRun } from "@/services/trends/trend-system-engine";
import { runTrendSystemBacktests } from "@/services/trends/trend-system-ledger";

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

function readLimit(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 1000) : fallback;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized trend system cycle request." }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const url = new URL(request.url);
    const league = url.searchParams.get("league")?.trim().toUpperCase() || "ALL";
    const includeInactive = url.searchParams.get("inactive") !== "false";
    const limit = readLimit(url.searchParams.get("limit"), 500);

    const capture = await capturePublishedTrendSystemMatches({ league, includeInactive });
    const closingLines = await updateTrendSystemClosingLines({ limit });
    const grade = await gradeCapturedTrendSystemMatches({ limit });
    const systemRun = await buildTrendSystemRun({ league: league as any, includeInactive: true });
    const backtests = await runTrendSystemBacktests(systemRun.systems, { preferSaved: true });

    const finishedAt = new Date();
    const warnings = [
      capture.ok ? null : "Capture did not complete successfully.",
      closingLines.ok ? null : "Closing-line update did not complete successfully.",
      grade.ok ? null : "Grading did not complete successfully.",
      capture.summary.skippedMatches ? `${capture.summary.skippedMatches} capture matches skipped.` : null,
      closingLines.summary.skipped ? `${closingLines.summary.skipped} closing-line rows skipped.` : null,
      grade.summary.skippedOpen ? `${grade.summary.skippedOpen} grade rows skipped.` : null,
      backtests.summary.seededFallback ? `${backtests.summary.seededFallback} systems still using seeded fallback.` : null
    ].filter(Boolean);

    return NextResponse.json({
      ok: capture.ok && closingLines.ok && grade.ok,
      generatedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      league,
      limit,
      steps: {
        capture: capture.summary,
        closingLines: closingLines.summary,
        grade: grade.summary,
        backtests: backtests.summary
      },
      health: {
        systems: systemRun.summary.systems,
        activeSystems: systemRun.summary.activeSystems,
        activeMatches: systemRun.summary.activeMatches,
        savedLedgerBacked: backtests.summary.savedLedgerBacked,
        eventMarketBacked: backtests.summary.eventMarketBacked,
        seededFallback: backtests.summary.seededFallback,
        totalSavedRows: backtests.summary.totalSavedRows,
        totalSavedGradedRows: backtests.summary.totalSavedGradedRows,
        totalOpenRows: backtests.summary.totalOpenRows,
        totalEventMarketRows: backtests.summary.totalEventMarketRows,
        totalEventMarketGradedRows: backtests.summary.totalEventMarketGradedRows
      },
      warnings,
      nextAction: warnings.length
        ? "Trend system cycle completed with warnings. Inspect skipped rows and fallback counts."
        : "Trend system cycle completed cleanly.",
      details: {
        capture,
        closingLines,
        grade
      }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt.getTime(),
      error: error instanceof Error ? error.message : "Failed to run trend system cycle."
    }, { status: 500 });
  }
}
