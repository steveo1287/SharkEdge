import { NextResponse } from "next/server";

import {
  readSimCache,
  SIM_CACHE_KEYS,
  type SimPrioritySnapshot,
  type SimRefreshStatusSnapshot
} from "@/services/simulation/sim-snapshot-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const maxRows = Math.min(10, Math.max(1, Number(url.searchParams.get("limit") ?? 10) || 10));

  // Cache boundary: this endpoint is a reader only. Projection and edge work runs in cron.
  const [priority, status] = await Promise.all([
    readSimCache<SimPrioritySnapshot>(SIM_CACHE_KEYS.priority),
    readSimCache<SimRefreshStatusSnapshot>(SIM_CACHE_KEYS.refreshStatus)
  ]);

  if (!priority) {
    return NextResponse.json(
      {
        ok: false,
        generatedAt: new Date().toISOString(),
        stale: true,
        rows: [],
        summary: { gameCount: 0, rowCount: 0, nbaCount: 0, mlbCount: 0, matchedMlbLines: 0 },
        reason: status?.reason ?? "priority_snapshot_missing"
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    ...priority,
    rows: priority.rows.slice(0, maxRows),
    summary: {
      ...priority.summary,
      rowCount: Math.min(priority.summary.rowCount, maxRows)
    }
  });
}
