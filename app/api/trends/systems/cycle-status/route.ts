import { NextResponse } from "next/server";

import { readTrendSystemCycleStatus } from "@/services/trends/trend-system-cycle-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const status = await readTrendSystemCycleStatus();
  return NextResponse.json({
    ok: Boolean(status?.ok),
    generatedAt: new Date().toISOString(),
    status: status ?? null,
    nextAction: status
      ? status.running
        ? "Trend system cycle is currently running."
        : status.ok
          ? status.reason ?? "Last trend system cycle completed successfully."
          : status.reason ?? "Last trend system cycle failed or has not completed cleanly."
      : "No trend system cycle status has been written yet. Run /api/trends/systems/cycle."
  });
}
