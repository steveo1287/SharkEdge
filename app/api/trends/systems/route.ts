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

function seededMetricsSummary(count: number) {
  return {
    systems: count,
    ledgerBacked: 0,
    savedLedgerBacked: 0,
    eventMarketBacked: 0,
    seededFallback: count,
    totalLedgerRows: 0,
    totalGradedRows: 0,
    totalOpenRows: 0,
    totalSavedRows: 0,
    totalSavedGradedRows: 0,
    totalEventMarketRows: 0,
    totalEventMarketGradedRows: 0
  };
}

function seededProvenance(reason: string) {
  return {
    source: "seeded-fallback",
    reason,
    ledgerRows: 0,
    gradedRows: 0,
    openRows: 0,
    savedRows: 0,
    eventMarketRows: 0
  };
}

function attachSeededFallbackProvenance(run: Awaited<ReturnType<typeof buildTrendSystemRun>>) {
  return {
    ...run,
    systems: run.systems.map((system) => ({
      ...system,
      metricsProvenance: seededProvenance(
        "Starter published-system metric. Add ?ledger=true to prefer saved captured/graded ledger metrics, then fall back to EventMarket backtest metrics."
      )
    })),
    metricsSummary: seededMetricsSummary(run.systems.length)
  };
}

async function attachLedgerProvenance(run: Awaited<ReturnType<typeof buildTrendSystemRun>>) {
  const backtest = await runTrendSystemBacktests(run.systems, { preferSaved: true });
  const bySystemId = new Map(backtest.results.map((result) => [result.systemId, result]));
  return {
    ...run,
    systems: run.systems.map((system) => {
      const result = bySystemId.get(system.id);
      if (!result) {
        return {
          ...system,
          metricsProvenance: seededProvenance("No saved-ledger or EventMarket backtest result was returned for this system.")
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
          gradedRows: result.metrics.gradedRows,
          openRows: result.metrics.openRows ?? 0,
          savedRows: result.metrics.savedRows ?? 0,
          eventMarketRows: result.metrics.eventMarketRows ?? 0
        },
        recentLedgerRecords: result.records.slice(0, 10)
      };
    }),
    metricsSummary: backtest.summary
  };
}

function nextLedgerAction(output: Awaited<ReturnType<typeof attachLedgerProvenance>>) {
  if (output.metricsSummary.savedLedgerBacked) {
    return "Saved captured/graded ledger is driving at least one published system. Keep capture/grade running after results settle.";
  }
  if (output.metricsSummary.eventMarketBacked) {
    return "No saved captured/graded rows are available yet for these systems. Metrics are using historical EventMarket/EventResult backtest where sample is strong enough.";
  }
  return "No saved-ledger or EventMarket sample is strong enough yet. Metrics are using seeded fallback until capture/grade/history rows accumulate.";
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
      ledgerPreference: includeLedger ? "saved-ledger -> event-market-backtest -> seeded-fallback" : "seeded-fallback",
      ...output,
      nextAction: output.summary.activeMatches
        ? output.summary.actionableMatches
          ? "Published trend systems have active actionable matches. Review activeMatches before acting."
          : "Published trend systems have active watchlist matches. Confirm current price before acting."
        : includeLedger
          ? nextLedgerAction(output as Awaited<ReturnType<typeof attachLedgerProvenance>>)
          : "No published systems currently match the warmed sim slate. Add ?ledger=true to prefer saved captured/graded ledger metrics."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to build trend systems."
    }, { status: 500 });
  }
}
