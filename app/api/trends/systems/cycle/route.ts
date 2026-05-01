import { NextRequest, NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { capturePublishedTrendSystemMatches } from "@/services/trends/trend-system-capture";
import { updateTrendSystemClosingLines } from "@/services/trends/trend-system-closing-lines";
import { emptyTrendSystemCycleSummary, writeTrendSystemCycleStatus } from "@/services/trends/trend-system-cycle-status";
import { PUBLISHED_SYSTEMS, buildTrendSystemRun } from "@/services/trends/trend-system-engine";
import { gradeCapturedTrendSystemMatches, inspectTrendSystemGradeQueue } from "@/services/trends/trend-system-grader";
import { runTrendSystemBacktests } from "@/services/trends/trend-system-ledger";
import { backfillTrendSystemEventResults } from "@/services/trends/trend-system-result-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const expected = process.env.TRENDS_REFRESH_TOKEN?.trim() || process.env.CRON_SECRET?.trim() || process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_API_KEY2?.trim();
  if (!expected) return true;
  const url = new URL(request.url);
  const bearer = (request.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ") ? (request.headers.get("authorization") ?? "").slice(7).trim() : null;
  return url.searchParams.get("token") === expected || bearer === expected;
}

function readLeague(value: string | null): LeagueKey | "ALL" {
  const normalized = value?.trim().toUpperCase();
  return normalized === "NBA" || normalized === "MLB" || normalized === "NHL" || normalized === "NFL" || normalized === "NCAAF" || normalized === "NCAAB" || normalized === "UFC" || normalized === "BOXING"
    ? normalized as LeagueKey
    : "ALL";
}

function filteredSystems(league: LeagueKey | "ALL") {
  return PUBLISHED_SYSTEMS.filter((system) => league === "ALL" || system.league === league);
}

function nextAction(ok: boolean, graded: number, resultBackfilled: number, closingUpdated: number, captured: number, savedLedgerRows: number, missingResults: number) {
  if (!ok) return "One or more cycle steps reported a failure. Inspect cycle samples and skipped rows.";
  if (graded) return "Cycle completed, backfilled results, and graded saved trend rows. Check /api/trends/systems?ledger=true and /trends.";
  if (resultBackfilled) return "Final EventResult data was backfilled, but no rows graded. Inspect grade queue mapping/line blockers.";
  if (missingResults) return "Open rows remain blocked by missing EventResult. Provider coverage or event mapping needs repair.";
  if (closingUpdated) return "Cycle updated closing/current odds. Rows will grade once EventResult exists.";
  if (captured) return "Cycle captured active system matches. Closing lines or results may not be available yet.";
  if (savedLedgerRows) return "Cycle ran cleanly. Existing saved-ledger rows are present, but no new rows changed this pass.";
  return "Cycle ran cleanly, but no saved-ledger rows exist yet. Confirm current slate, Event rows, and market cache mapping.";
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized trend system cycle request." }, { status: 401 });
  const startedAt = new Date();
  let league: LeagueKey | "ALL" = "ALL";
  let safeLimit = 500;

  try {
    const url = new URL(request.url);
    league = readLeague(url.searchParams.get("league"));
    const limit = Number(url.searchParams.get("limit") ?? "500");
    safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 500, 1), 1000);
    const includeInactive = url.searchParams.get("inactive") !== "false";
    const skipResultBackfill = url.searchParams.get("backfillResults") === "false";

    await writeTrendSystemCycleStatus({
      ok: false,
      running: true,
      lastStartedAt: startedAt.toISOString(),
      durationMs: null,
      league,
      limit: safeLimit,
      reason: "Trend system cycle running.",
      warnings: [],
      summary: emptyTrendSystemCycleSummary(),
      sourceStatus: { phase: "running", resultBackfillEnabled: !skipResultBackfill }
    });

    const beforeRun = await buildTrendSystemRun({ league, includeInactive: true });
    const beforeQueue = await inspectTrendSystemGradeQueue({ limit: safeLimit });
    const capture = await capturePublishedTrendSystemMatches({ league, includeInactive });
    const closingLines = await updateTrendSystemClosingLines({ limit: safeLimit });
    const resultBackfill = skipResultBackfill
      ? { ok: true, summary: { openRows: 0, leagues: 0, totalFetched: 0, totalUpserted: 0, totalFinalEvents: 0 }, nextAction: "Result backfill skipped by query parameter.", leagues: [] }
      : await backfillTrendSystemEventResults({ limit: safeLimit });
    const grade = await gradeCapturedTrendSystemMatches({ limit: safeLimit });
    const afterQueue = await inspectTrendSystemGradeQueue({ limit: safeLimit });
    const afterRun = await buildTrendSystemRun({ league, includeInactive: true });
    const ledger = await runTrendSystemBacktests(filteredSystems(league), { preferSaved: true });

    const finishedAt = new Date();
    const ok = Boolean(capture.ok && closingLines.ok && resultBackfill.ok && grade.ok);
    const captured = capture.summary.capturedMatches;
    const closingUpdated = closingLines.summary.updated;
    const resultBackfilled = resultBackfill.summary.totalFinalEvents;
    const graded = grade.summary.gradedMatches;
    const missingResults = afterQueue.summary?.missingEventResult ?? 0;
    const action = nextAction(ok, graded, resultBackfilled, closingUpdated, captured, ledger.summary.totalSavedRows, missingResults);
    const warnings = [
      capture.ok ? null : "Capture step reported failure.",
      closingLines.ok ? null : "Closing-line step reported failure.",
      resultBackfill.ok ? null : "Result-backfill step reported failure.",
      grade.ok ? null : "Grade step reported failure.",
      capture.summary.skippedMatches ? `${capture.summary.skippedMatches} capture matches skipped.` : null,
      closingLines.summary.skipped ? `${closingLines.summary.skipped} closing-line rows skipped.` : null,
      resultBackfill.summary.totalFinalEvents ? null : "Result backfill found no final events for open trend rows.",
      grade.summary.skippedOpen ? `${grade.summary.skippedOpen} grade rows skipped.` : null,
      missingResults ? `${missingResults} open rows still missing EventResult.` : null,
      ledger.summary.seededFallback ? `${ledger.summary.seededFallback} systems still using seeded fallback.` : null
    ].filter((warning): warning is string => Boolean(warning));

    const status = await writeTrendSystemCycleStatus({
      ok,
      running: false,
      lastStartedAt: startedAt.toISOString(),
      lastSuccessAt: ok ? finishedAt.toISOString() : null,
      lastFailureAt: ok ? null : finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      league,
      limit: safeLimit,
      reason: action,
      warnings,
      summary: {
        capturedMatches: captured,
        closingLinesUpdated: closingUpdated,
        gradedMatches: graded,
        snapshotsWritten: grade.summary.snapshotsWritten,
        savedLedgerBacked: ledger.summary.savedLedgerBacked,
        eventMarketBacked: ledger.summary.eventMarketBacked,
        seededFallback: ledger.summary.seededFallback,
        totalSavedRows: ledger.summary.totalSavedRows,
        totalSavedGradedRows: ledger.summary.totalSavedGradedRows,
        totalOpenRows: ledger.summary.totalOpenRows
      },
      sourceStatus: {
        before: beforeRun.summary,
        beforeQueue: beforeQueue.summary,
        capture: capture.summary,
        closingLines: closingLines.summary,
        resultBackfill: resultBackfill.summary,
        grade: grade.summary,
        afterQueue: afterQueue.summary,
        after: afterRun.summary,
        ledger: ledger.summary
      }
    });

    return NextResponse.json({
      ok,
      generatedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      league,
      limit: safeLimit,
      status,
      cycle: {
        before: beforeRun.summary,
        beforeQueue: beforeQueue.summary,
        capture: capture.summary,
        closingLines: closingLines.summary,
        resultBackfill: resultBackfill.summary,
        grade: grade.summary,
        afterQueue: afterQueue.summary,
        after: afterRun.summary,
        ledger: ledger.summary
      },
      diagnostics: {
        captureDatabase: capture.database,
        closingLinesDatabase: closingLines.database,
        gradeDatabase: grade.database,
        captured,
        closingUpdated,
        resultBackfilled,
        graded,
        missingResults,
        savedLedgerRows: ledger.summary.totalSavedRows,
        savedGradedRows: ledger.summary.totalSavedGradedRows,
        openRows: ledger.summary.totalOpenRows,
        seededFallback: ledger.summary.seededFallback,
        eventMarketBacked: ledger.summary.eventMarketBacked,
        savedLedgerBacked: ledger.summary.savedLedgerBacked
      },
      samples: {
        capture: capture.results.slice(0, 10),
        closingLines: closingLines.updates.slice(0, 10),
        resultBackfill: resultBackfill.leagues.slice(0, 10),
        graded: grade.graded.slice(0, 10),
        skippedGrade: grade.skipped.slice(0, 10),
        queueBlockers: afterQueue.samples?.slice?.(0, 10) ?? []
      },
      nextAction: action
    });
  } catch (error) {
    const finishedAt = new Date();
    await writeTrendSystemCycleStatus({
      ok: false,
      running: false,
      lastStartedAt: startedAt.toISOString(),
      lastFailureAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      league,
      limit: safeLimit,
      reason: error instanceof Error ? error.message : "Failed to run trend system cycle.",
      warnings: ["Trend system cycle threw before completion."],
      summary: emptyTrendSystemCycleSummary(),
      sourceStatus: {}
    });
    return NextResponse.json({ ok: false, generatedAt: finishedAt.toISOString(), durationMs: finishedAt.getTime() - startedAt.getTime(), error: error instanceof Error ? error.message : "Failed to run trend system cycle." }, { status: 500 });
  }
}
