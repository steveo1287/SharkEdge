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

function boolParam(value: string | null, fallback = false) {
  if (value == null) return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const url = new URL(request.url);
  console.info("[sim-refresh] started");

  const { runStatsPipelinePreflight } = await import("@/services/ops/stats-pipeline-preflight");
  const { refreshFullSimSnapshots } = await import("@/services/simulation/sim-snapshot-service");
  const { refreshMainMlbSimSnapshot } = await import("@/services/simulation/main-sim-snapshot-service");

  const statsPipeline = await runStatsPipelinePreflight({
    source: "cron-sim-refresh",
    force: boolParam(url.searchParams.get("statsForce"), false),
    enabled: boolParam(url.searchParams.get("statsPreflight"), false),
    runMlb: boolParam(url.searchParams.get("runMlb"), true),
    runUfc: boolParam(url.searchParams.get("runUfc"), true),
    includeLineups: boolParam(url.searchParams.get("includeLineups"), true),
    mlbLookbackDays: Number(url.searchParams.get("mlbLookbackDays") ?? 45),
    mlbLimit: Number(url.searchParams.get("mlbLimit") ?? 1500),
    ufcLimit: Number(url.searchParams.get("ufcLimit") ?? 50),
    modelVersion: url.searchParams.get("modelVersion") ?? "ufc-fight-iq-v1"
  }).catch((error) => ({
    ok: false,
    attempted: false,
    skipped: false,
    reason: "preflight-error",
    error: error instanceof Error ? error.message : "unknown stats preflight error"
  }));

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
  const ok = Boolean(statsPipeline.ok && result.ok && mainMlb.ok);
  console.info(`[sim-refresh] completed ${elapsedMs}ms ok=${ok} statsPreflight=${statsPipeline.ok} mainMlb=${mainMlb.ok} rows=${mainMlb.rowCount}`);

  return NextResponse.json({
    ok,
    queued: false,
    mainBrain: "mlb-intel-v8-player-impact+mlb-intel-v7-calibration",
    startedAt: new Date(startedAt).toISOString(),
    elapsedMs,
    statsPipeline,
    result,
    mainMlb
  }, { status: ok ? 200 : 207 });
}