import { NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { buildTrendSystemRun } from "@/services/trends/trend-system-engine";
import { runTrendSystemBacktests } from "@/services/trends/trend-system-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function attachSeededFallbackProvenance(run: Awaited<ReturnType<typeof buildTrendSystemRun>>) {
  return {
    ...run,
    systems: run.systems.map((system) => ({
      ...system,
      metricsProvenance: {
        source: "seeded-fallback",
        reason: "Starter published-system metric. Add ?ledger=true to attempt DB-backed backtest metrics.",
        ledgerRows: 0,
        gradedRows: 0
      }
    })),
    metricsSummary: {
      ledgerBacked: 0,
      seededFallback: run.systems.length,
      totalLedgerRows: 0,
      totalGradedRows: 0
    }
  };
}

async function attachLedgerProvenance(run: Awaited<ReturnType<typeof buildTrendSystemRun>>) {
  const backtest = await runTrendSystemBacktests(run.systems);
  const bySystemId = new Map(backtest.results.map((result) => [result.systemId, result]));
  return {
    ...run,
    systems: run.systems.map((system) => {
      const result = bySystemId.get(system.id);
      if (!result) {
        return {
          ...system,
          metricsProvenance: {
            source: "seeded-fallback",
            reason: "No ledger backtest result was returned for this system.",
            ledgerRows: 0,
            gradedRows: 0
          }
        };
      }
      return {
        ...system,
        metrics: {
          wins: result.metrics.wins,
          losses: result.metrics.losses,
          pushes: result.metrics.pushes,
          profitUnits: result.metrics.profitUnits,
          roiPct: result.metrics.roiPct,
          winRatePct: result.metrics.winRatePct,
          sampleSize: result.metrics.sampleSize,
          currentStreak: result.metrics.currentStreak,
          last30WinRatePct: result.metrics.last30WinRatePct,
          clvPct: result.metrics.clvPct,
          seasons: result.metrics.seasons
        },
        metricsProvenance: {
          source: result.metrics.source,
          reason: result.metrics.reason,
          ledgerRows: result.metrics.ledgerRows,
          gradedRows: result.metrics.gradedRows
        },
        recentLedgerRecords: result.records.slice(0, 10)
      };
    }),
    metricsSummary: backtest.summary
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const league = readLeague(url.searchParams.get("league"));
    const includeInactive = url.searchParams.get("inactive") === "true";
    const includeLedger = url.searchParams.get("ledger") === "true";
    const run = await buildTrendSystemRun({ league, includeInactive });
    const output = includeLedger ? await attachLedgerProvenance(run) : attachSeededFallbackProvenance(run);

    return NextResponse.json({
      ok: true,
      ledgerRequested: includeLedger,
      ...output,
      nextAction: output.summary.activeMatches
        ? output.summary.actionableMatches
          ? "Published trend systems have active actionable matches. Review activeMatches before acting."
          : "Published trend systems have active watchlist matches. Confirm current price before acting."
        : includeLedger && output.metricsSummary.ledgerBacked === 0
          ? "No published systems currently match the warmed sim slate, and ledger metrics are falling back. Check historical event market/result ingestion."
          : "No published systems currently match the warmed sim slate."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to build trend systems."
    }, { status: 500 });
  }
}
