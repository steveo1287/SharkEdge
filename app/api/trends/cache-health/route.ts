import { NextResponse } from "next/server";

import type { TrendFilters, TrendMode } from "@/lib/types/domain";
import { trendFiltersSchema } from "@/lib/validation/filters";
import { getTrendDashboardCacheHealth } from "@/services/trends/dashboard-cache";

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
    const health = await getTrendDashboardCacheHealth(filters, { mode, aiQuery, savedTrendId });
    return NextResponse.json({
      ok: health.effectiveStatus !== "cold",
      generatedAt: new Date().toISOString(),
      health
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to read trend cache health."
    }, { status: 500 });
  }
}
