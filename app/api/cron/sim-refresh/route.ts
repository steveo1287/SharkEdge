import { NextResponse } from "next/server";

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

  const { refreshFullSimSnapshots } = await import("@/services/simulation/sim-snapshot-service");
  const { refreshMainMlbSimSnapshot } = await import("@/services/simulation/main-sim-snapshot-service");

  const result = await refreshFullSimSnapshots().catch((error) => ({
    ok: false,
    skippedSnapshotWrites: false,
    warnings: [error instanceof Error ? error.message : "unknown full sim refresh error"]
  }));

  const mainMlb = await refreshMainMlbSimSnapshot().catch((error) => ({
    ok: false,
    gameCount: 0,
    rowCount: 0,
    warnings: [error instanceof Error ? error.message : "unknown main MLB brain refresh error"]
  }));

  const elapsedMs = Date.now() - startedAt;
  const ok = Boolean(result.ok && mainMlb.ok);
  console.info(`[sim-refresh] completed ${elapsedMs}ms ok=${ok} mainMlb=${mainMlb.ok} rows=${mainMlb.rowCount}`);

  return NextResponse.json({
    ok,
    queued: false,
    mainBrain: "mlb-intel-v8-player-impact+mlb-intel-v7-calibration",
    startedAt: new Date(startedAt).toISOString(),
    elapsedMs,
    result,
    mainMlb
  }, { status: ok ? 200 : 207 });
}
