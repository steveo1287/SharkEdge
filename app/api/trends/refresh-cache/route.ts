import { NextRequest, NextResponse } from "next/server";

import type { SupportedLeagueKey } from "@/lib/types/ledger";
import { runSimAccuracyLedgerJob } from "@/services/simulation/sim-accuracy-ledger";
import { getTrendPerformanceMetrics } from "@/services/trends/performance-metrics";
import { refreshTrendIntelligence } from "@/services/trends/refresh-service";
import { warmTrendDashboardCaches } from "@/services/trends/dashboard-cache";
import { trendFiltersSchema } from "@/lib/validation/filters";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

export async function GET(request: NextRequest) {
  try {
    if (!authorized(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized trends refresh request." }, { status: 401 });
    }

    const url = new URL(request.url);
    const leagues = parseLeagues(url.searchParams.get("leagues"));
    const days = Number(url.searchParams.get("days") ?? "7");
    const shouldCaptureSim = url.searchParams.get("sim") !== "false";

    const [refresh, simLedger, warm, allPerformance, nbaPerformance, mlbPerformance] = await Promise.all([
      refreshTrendIntelligence({ leagues, days: Number.isFinite(days) ? days : 7 }),
      shouldCaptureSim ? runSimAccuracyLedgerJob().catch((error) => ({ ok: false, error: error instanceof Error ? error.message : "Sim ledger refresh failed." })) : Promise.resolve({ ok: true, skipped: true }),
      warmTrendDashboardCaches({ leagues: ["ALL", "MLB", "NBA", "NHL", "NFL", "NCAAF"], markets: ["ALL", "moneyline", "spread", "total"] }),
      getTrendPerformanceMetrics(trendFiltersSchema.parse({})),
      getTrendPerformanceMetrics(trendFiltersSchema.parse({ league: "NBA" })),
      getTrendPerformanceMetrics(trendFiltersSchema.parse({ league: "MLB" }))
    ]);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      cadenceSeconds: 600,
      refresh,
      simLedger,
      warm,
      performance: {
        all: allPerformance,
        NBA: nbaPerformance,
        MLB: mlbPerformance
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Failed to refresh trends cache." }, { status: 500 });
  }
}
