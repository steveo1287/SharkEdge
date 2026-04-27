import { NextResponse } from "next/server";
import { refreshMlbAnalyticsCache } from "@/services/simulation/mlb-analytics-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const result = await refreshMlbAnalyticsCache();
    return NextResponse.json({ ok: result.ok, source: result.source, teamCount: result.teams.length, message: result.message });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
