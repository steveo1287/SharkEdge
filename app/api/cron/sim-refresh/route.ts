import { after, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (request.headers.get("x-vercel-cron") === "1") return true;
  if (!cronSecret) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return bearer === cronSecret;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  console.info("[sim-refresh] started");
  after(async () => {
    const { refreshFullSimSnapshots } = await import("@/services/simulation/sim-snapshot-service");
    const { refreshMainMlbSimSnapshot } = await import("@/services/simulation/main-sim-snapshot-service");
    const result = await refreshFullSimSnapshots();
    const mainMlb = await refreshMainMlbSimSnapshot().catch((error) => ({
      ok: false,
      gameCount: 0,
      rowCount: 0,
      warnings: [error instanceof Error ? error.message : "unknown main MLB brain refresh error"]
    }));
    console.info(`[sim-refresh] completed ${Date.now() - startedAt}ms ok=${result.ok} mainMlb=${mainMlb.ok} rows=${mainMlb.rowCount}`);
  });
  return NextResponse.json({ ok: true, queued: true, mainBrain: "mlb-intel-v8-player-impact+mlb-intel-v7-calibration", startedAt: new Date(startedAt).toISOString() }, { status: 202 });
}
