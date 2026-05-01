import { NextResponse } from "next/server";

import type { TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getTrendDashboardCacheHealth } from "@/services/trends/dashboard-cache";
import { readTrendRefreshStatus } from "@/services/trends/refresh-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readMode(value: string | null): TrendMode {
  return value === "power" ? "power" : "simple";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters = trendFiltersSchema.parse(Object.fromEntries(url.searchParams.entries())) as TrendFilters;
    const mode = readMode(url.searchParams.get("mode"));
    const aiQuery = url.searchParams.get("q")?.trim() ?? "";
    const savedTrendId = url.searchParams.get("savedTrendId")?.trim() ?? null;
    const [health, refreshStatus] = await Promise.all([
      getTrendDashboardCacheHealth(filters, { mode, aiQuery, savedTrendId }),
      readTrendRefreshStatus()
    ]);
    return NextResponse.json({
      ok: health.effectiveStatus !== "cold" || Boolean(refreshStatus?.running),
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
      nextAction: health.effectiveStatus !== "cold"
        ? "Trend dashboard cache is usable."
        : refreshStatus?.running
          ? "Trend refresh is queued/running; reload health after it completes."
          : "Run /api/trends/refresh-cache with a valid token to warm trend caches."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read trend cache health."
    }, { status: 500 });
  }
}
