import { NextResponse } from "next/server";

import { getMainSimBrainStatusReport } from "@/services/simulation/main-sim-brain-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 5);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(10, Math.round(numeric))) : 5;
}

function timeoutAfter(ms: number) {
  return new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`main-brain status timeout after ${ms}ms`)), ms));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  try {
    const result = await Promise.race([
      getMainSimBrainStatusReport(parseLimit(searchParams.get("limit"))),
      timeoutAfter(55_000)
    ]);
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown main-brain status error";
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      status: {
        status: "RED",
        blockers: [reason],
        warnings: ["Main-brain status is capped to a small live sample to avoid freezing the Sim Hub."],
        recommendations: ["Use /api/sim/health for cache health and /api/sim/main-brain/status?limit=3 for a smaller live diagnostic sample."]
      }
    }, { status: 200 });
  }
}
