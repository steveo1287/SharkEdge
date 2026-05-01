import { NextResponse } from "next/server";

import type { LeagueKey, TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getTrendDashboardCacheHealth } from "@/services/trends/dashboard-cache";
import { readTrendRefreshStatus } from "@/services/trends/refresh-status";
import { readTrendSystemCycleStatus } from "@/services/trends/trend-system-cycle-status";
import { buildTrendSignals } from "@/services/trends/trends-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readMode(value: string | null): TrendMode {
  return value === "power" ? "power" : "simple";
}

function countBy<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1;
    return acc;
  }, {});
}

async function optionalSignalSummary(filters: TrendFilters, enabled: boolean) {
  if (!enabled) return null;
  const league = filters.league === "ALL" ? "ALL" : filters.league as LeagueKey;
  const payload = await buildTrendSignals({ league, includeHidden: false, includeResearch: false });
  const signals = payload.signals;
  const gameIds = new Set(signals.map((signal) => signal.gameId).filter(Boolean));
  const priced = signals.filter((signal) => signal.marketQuality.currentOddsAmerican != null || signal.currentOddsAmerican != null);
  return {
    source: payload.counts.source,
    cacheStale: payload.counts.cacheStale,
    cacheHits: payload.counts.cacheHits,
    totalVisible: signals.length,
    totalRaw: payload.counts.totalRaw,
    hidden: payload.counts.hiddenQuality,
    gamesCovered: gameIds.size,
    pricedSignals: priced.length,
    bySource: countBy(signals.map((signal) => signal.source)),
    byActionability: countBy(signals.map((signal) => signal.quality.actionability)),
    byQualityTier: countBy(signals.map((signal) => signal.qualityTier))
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = trendFiltersSchema.parse(Object.fromEntries(url.searchParams.entries())) as TrendFilters;
    const mode = readMode(url.searchParams.get("mode"));
    const aiQuery = url.searchParams.get("q")?.trim() ?? "";
    const savedTrendId = url.searchParams.get("savedTrendId")?.trim() ?? null;
    const includeSignals = url.searchParams.get("signals") === "true";
    const [health, refreshStatus, cycleStatus, signalSummary] = await Promise.all([
      getTrendDashboardCacheHealth(filters, { mode, aiQuery, savedTrendId }),
      readTrendRefreshStatus(),
      readTrendSystemCycleStatus(),
      optionalSignalSummary(filters, includeSignals)
    ]);
    const cacheReady = health.effectiveStatus !== "cold";
    const refreshRunning = Boolean(refreshStatus?.running || refreshStatus?.queued);
    const cycleRunning = Boolean(cycleStatus?.running);
    const cycleHealthy = Boolean(cycleStatus?.ok || cycleRunning);
    return NextResponse.json({
      ok: cacheReady || refreshRunning || cycleHealthy,
      generatedAt: new Date().toISOString(),
      health,
      refreshStatus: refreshStatus ?? {
        running: false,
        queued: false,
        ok: false,
        lastStartedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        reason: "No trends refresh status snapshot found."
      },
      cycleStatus: cycleStatus ?? {
        running: false,
        ok: false,
        lastStartedAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        reason: "No trend system cycle status snapshot found."
      },
      signalSummary,
      nextAction: cacheReady
        ? signalSummary?.totalVisible
          ? cycleHealthy
            ? "Trend cache is usable, real signals are present, and the trend-system cycle has a status snapshot."
            : "Trend cache is usable and real signals are present. Run /api/trends/systems/cycle to create a cycle status snapshot."
          : "Trend dashboard cache is usable. Add ?signals=true to inspect real signal counts."
        : refreshRunning
          ? "Trend refresh is queued/running; reload health after it completes."
          : cycleRunning
            ? "Trend system cycle is running; reload health after it completes."
            : "Run /api/trends/refresh-cache and /api/trends/systems/cycle with valid tokens to warm trends."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read trend cache health."
    }, { status: 500 });
  }
}
