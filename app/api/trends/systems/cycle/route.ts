import { NextRequest, NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { PUBLISHED_SYSTEMS, buildTrendSystemRun } from "@/services/trends/trend-system-engine";
import { runTrendSystemBacktests } from "@/services/trends/trend-system-ledger";
import { capturePublishedTrendSystemMatches } from "@/services/trends/trend-system-capture";
import { updateTrendSystemClosingLines } from "@/services/trends/trend-system-closing-lines";
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

function readLeague(value: string | null): LeagueKey | "ALL" {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "NBA" ||
    normalized === "MLB" ||
    normalized === "NHL" ||
    normalized === "NFL" ||
    normalized === "NCAAF" ||
    normalized === "NCAAB" ||
    normalized === "UFC" ||
    normalized === "BOXING"
  ) {
    return normalized as LeagueKey;
  }
  return "ALL";
}

function filteredSystems(league: LeagueKey | "ALL") {
  return PUBLISHED_SYSTEMS.filter((system) => league === "ALL" || system.league === league);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized trend system cycle request." }, { status: 401 });
  }

  const startedAt = new Date();
  try {
    const url = new URL(request.url);
    const league = readLeague(url.searchParams.get("league"));
    const limit = Number(url.searchParams.get("limit") ?? "500");
    const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 500, 1), 1000);
    const includeInactive = url.searchParams.get("inactive") !== "false";

    const beforeRun = await buildTrendSystemRun({ league, includeInactive: true });
    const capture = await capturePublishedTrendSystemMatches({ league, includeInactive });
    const closingLines = await updateTrendSystemClosingLines({ limit: safeLimit });
    const grade = await gradeCapturedTrendSystemMatches({ limit: safeLimit });
    const afterRun = await buildTrendSystemRun({ league, includeInactive: true });
    const ledger = await runTrendSystemBacktests(filteredSystems(league), { preferSaved: true });

    const finishedAt = new Date();
    const captured = capture.summary.capturedMatches;
    const closingUpdated = closingLines.summary.updated;
    const graded = grade.summary.gradedMatches;
    const savedLedgerRows = ledger.summary.totalSavedRows;
    const savedGradedRows = ledger.summary.totalSavedGradedRows;
    const ok = Boolean(capture.ok && closingLines.ok && grade.ok);

    return NextResponse.json({
      ok,
      generatedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      league,
      limit: safeLimit,
      cycle: {
        before: {
          systems: beforeRun.summary.systems,
          activeSystems: beforeRun.summary.activeSystems,
          activeMatches: beforeRun.summary.activeMatches,
          actionableMatches: beforeRun.summary.actionableMatches,
          watchlistMatches: beforeRun.summary.watchlistMatches
        },
        capture: capture.summary,
        closingLines: closingLines.summary,
        grade: grade.summary,
        after: {
          systems: afterRun.summary.systems,
          activeSystems: afterRun.summary.activeSystems,
          activeMatches: afterRun.summary.activeMatches,
          actionableMatches: afterRun.summary.actionableMatches,
          watchlistMatches: afterRun.summary.watchlistMatches
        },
        ledger: ledger.summary
      },
      diagnostics: {
        captureDatabase: capture.database,
        closingLinesDatabase: closingLines.database,
        gradeDatabase: grade.database,
        captured,
        closingUpdated,
        graded,
        savedLedgerRows,
        savedGradedRows,
        openRows: ledger.summary.totalOpenRows,
        seededFallback: ledger.summary.seededFallback,
        eventMarketBacked: ledger.summary.eventMarketBacked,
        savedLedgerBacked: ledger.summary.savedLedgerBacked
      },
      samples: {
        capture: capture.results.slice(0, 10),
        closingLines: closingLines.updates.slice(0, 10),
        graded: grade.graded.slice(0, 10),
        skippedGrade: grade.skipped.slice(0, 10),
        systems: ledger.results.slice(0, 10).map((result) => ({
          systemId: result.systemId,
          source: result.metrics.source,
          ledgerRows: result.metrics.ledgerRows,
          gradedRows: result.metrics.gradedRows,
          openRows: result.metrics.openRows ?? 0,
          sampleSize: result.metrics.sampleSize,
          roiPct: result.metrics.roiPct,
          winRatePct: result.metrics.winRatePct,
          reason: result.metrics.reason
        }))
      },
      nextAction: !ok
        ? "One or more cycle steps reported a failure. Inspect capture/closingLines/grade database states and sample errors."
        : graded
          ? "Cycle completed and graded saved trend rows. Check /api/trends/systems?ledger=true and /trends."
          : closingUpdated
            ? "Cycle updated closing/current odds. Rows will grade once EventResult exists."
            : captured
              ? "Cycle captured active system matches. Closing lines or results may not be available yet."
              : savedLedgerRows
                ? "Cycle ran cleanly. Existing saved-ledger rows are present, but no new rows changed this pass."
                : "Cycle ran cleanly, but no saved-ledger rows exist yet. Confirm current slate, Event rows, and market cache mapping."
    });
  } catch (error) {
    const finishedAt = new Date();
    return NextResponse.json({
      ok: false,
      generatedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      error: error instanceof Error ? error.message : "Failed to run trend system cycle."
    }, { status: 500 });
  }
}
