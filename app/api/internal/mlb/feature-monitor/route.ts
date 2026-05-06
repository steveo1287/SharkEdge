import { NextResponse } from "next/server";
import { ensureInternalApiAccess } from "@/lib/utils/internal-api";
import { runMlbFeatureMonitor, getLatestFeatureStatuses } from "@/services/simulation/mlb-feature-monitor";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "latest";

  try {
    if (mode === "run") {
      const report = await runMlbFeatureMonitor();
      return NextResponse.json({ ok: true, report });
    }

    // Default: read last snapshot per feature key from DB (fast)
    const statuses = await getLatestFeatureStatuses();
    const hasRed = Object.values(statuses).some((s) => s.status === "RED" || s.status === "STALE");
    return NextResponse.json({
      ok: true,
      overallOk: !hasRed,
      features: statuses,
      hint: "Use ?mode=run to run a fresh monitor pass and persist new snapshots.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[mlb/feature-monitor]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const unauthorized = ensureInternalApiAccess(request);
  if (unauthorized) return unauthorized;

  try {
    const report = await runMlbFeatureMonitor();
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
