import { after, NextRequest, NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { writeTrendRefreshStatus } from "@/services/trends/refresh-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const DEFAULT_TREND_LEAGUES: Array<LeagueKey | "ALL"> = ["ALL", "MLB", "NBA"];
const DEFAULT_TREND_MARKETS = ["ALL", "moneyline", "spread", "total"] as const;

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

function parseLeagues(value: string | null): SupportedLeagueKey[] | undefined {
  if (!value) return undefined;
  const leagues = value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean) as SupportedLeagueKey[];
  return leagues.length ? leagues : undefined;
}

function asTrendLeagueList(value: SupportedLeagueKey[] | undefined): Array<LeagueKey | "ALL"> {
  if (!value?.length) return DEFAULT_TREND_LEAGUES;
  const allowed = new Set(["NBA", "MLB", "NHL", "NFL", "NCAAF", "NCAAB", "UFC", "BOXING"]);
  const leagues = value.filter((league) => allowed.has(league)) as Array<LeagueKey | "ALL">;
  return leagues.length ? ["ALL", ...leagues] : DEFAULT_TREND_LEAGUES;
}

async function runTrendsRefreshJob(args: {
  leagues?: SupportedLeagueKey[];
  days: number;
  shouldCaptureSim: boolean;
  shouldRunIntelligence: boolean;
  shouldRunPerformance: boolean;
}) {
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const sourceStatus: Record<string, unknown> = {
    phase: "running",
    startedAt,
    leagues: args.leagues ?? "default",
    days: args.days,
    simLedger: args.shouldCaptureSim,
    intelligence: args.shouldRunIntelligence,
    performance: args.shouldRunPerformance
  };

  await writeTrendRefreshStatus({
    running: true,
    queued: false,
    ok: true,
    lastStartedAt: startedAt,
    lastSuccessAt: null,
    lastFailureAt: null,
    warnings,
    sourceStatus
  });

  try {
    const { warmTrendDashboardCaches } = await import("@/services/trends/dashboard-cache");
    const warmStartedAt = Date.now();
    const warm = await warmTrendDashboardCaches({
      leagues: asTrendLeagueList(args.leagues),
      markets: [...DEFAULT_TREND_MARKETS]
    });
    sourceStatus.warm = {
      ok: true,
      durationMs: Date.now() - warmStartedAt,
      warmed: warm.warmed.length,
      failures: warm.warmed.filter((item) => !item.ok).length
    };
    for (const item of warm.warmed) {
      if (!item.ok) warnings.push(`Warm failed ${item.mode}/${item.league}/${item.market}: ${item.error ?? "unknown"}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Trend cache warm failed.";
    warnings.push(reason);
    sourceStatus.warm = { ok: false, reason };
  }

  if (args.shouldRunIntelligence) {
    try {
      const { refreshTrendIntelligence } = await import("@/services/trends/refresh-service");
      const refreshStartedAt = Date.now();
      const refresh = await refreshTrendIntelligence({ leagues: args.leagues, days: args.days });
      sourceStatus.intelligenceRefresh = { ok: true, durationMs: Date.now() - refreshStartedAt, refresh };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Trend intelligence refresh failed.";
      warnings.push(reason);
      sourceStatus.intelligenceRefresh = { ok: false, reason };
    }
  }

  if (args.shouldCaptureSim) {
    try {
      const { runSimAccuracyLedgerJob } = await import("@/services/simulation/sim-accuracy-ledger");
      const simStartedAt = Date.now();
      const simLedger = await runSimAccuracyLedgerJob();
      sourceStatus.simLedger = { ok: true, durationMs: Date.now() - simStartedAt, simLedger };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Sim ledger refresh failed.";
      warnings.push(reason);
      sourceStatus.simLedger = { ok: false, reason };
    }
  }

  if (args.shouldRunPerformance) {
    try {
      const { getTrendPerformanceMetrics } = await import("@/services/trends/performance-metrics");
      const perfStartedAt = Date.now();
      const [allPerformance, nbaPerformance, mlbPerformance] = await Promise.all([
        getTrendPerformanceMetrics(trendFiltersSchema.parse({})),
        getTrendPerformanceMetrics(trendFiltersSchema.parse({ league: "NBA" })),
        getTrendPerformanceMetrics(trendFiltersSchema.parse({ league: "MLB" }))
      ]);
      sourceStatus.performance = {
        ok: true,
        durationMs: Date.now() - perfStartedAt,
        all: allPerformance,
        NBA: nbaPerformance,
        MLB: mlbPerformance
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Trend performance metrics failed.";
      warnings.push(reason);
      sourceStatus.performance = { ok: false, reason };
    }
  }

  const completedAt = new Date().toISOString();
  await writeTrendRefreshStatus({
    running: false,
    queued: false,
    ok: warnings.length === 0,
    lastStartedAt: startedAt,
    lastSuccessAt: warnings.length === 0 ? completedAt : null,
    lastFailureAt: warnings.length ? completedAt : null,
    reason: warnings[0] ?? null,
    warnings,
    sourceStatus: { ...sourceStatus, phase: "complete", completedAt }
  });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized trends refresh request." }, { status: 401 });
  }

  const url = new URL(request.url);
  const leagues = parseLeagues(url.searchParams.get("leagues"));
  const days = Number(url.searchParams.get("days") ?? "7");
  const normalizedDays = Number.isFinite(days) ? days : 7;
  const shouldCaptureSim = url.searchParams.get("sim") === "true";
  const shouldRunIntelligence = url.searchParams.get("intelligence") !== "false";
  const shouldRunPerformance = url.searchParams.get("performance") === "true";
  const startedAt = new Date().toISOString();

  await writeTrendRefreshStatus({
    running: true,
    queued: true,
    ok: true,
    lastStartedAt: startedAt,
    lastSuccessAt: null,
    lastFailureAt: null,
    warnings: [],
    sourceStatus: {
      phase: "queued",
      startedAt,
      leagues: leagues ?? "default",
      days: normalizedDays,
      simLedger: shouldCaptureSim,
      intelligence: shouldRunIntelligence,
      performance: shouldRunPerformance
    }
  });

  after(() => runTrendsRefreshJob({
    leagues,
    days: normalizedDays,
    shouldCaptureSim,
    shouldRunIntelligence,
    shouldRunPerformance
  }));

  return NextResponse.json({
    ok: true,
    queued: true,
    generatedAt: startedAt,
    cadenceSeconds: 600,
    next: "Check /api/trends/cache-health after the queued refresh completes."
  }, { status: 202 });
}
