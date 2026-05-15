import { after, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const url = new URL(request.url);
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (request.headers.get("x-vercel-cron") === "1") return true;
  if (!cronSecret) return true;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (bearer === cronSecret) return true;

  // This endpoint is intentionally usable from the Sim Hub UI. It only queues
  // cache refresh work and does not expose private data.
  return url.searchParams.get("force") === "1";
}

function boolParam(value: string | null, fallback = false) {
  if (value == null) return fallback;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

async function runRefresh(request: Request) {
  const url = new URL(request.url);
  const { runStatsPipelinePreflight } = await import("@/services/ops/stats-pipeline-preflight");
  const { refreshFullSimSnapshots, refreshSimMarketSnapshot } = await import("@/services/simulation/sim-snapshot-service");
  const { refreshMainMlbSimSnapshot } = await import("@/services/simulation/main-sim-snapshot-service");

  const startedAtMs = Date.now();
  const statsPipeline = await runStatsPipelinePreflight({
    source: "api-sim-refresh",
    force: boolParam(url.searchParams.get("statsForce"), false),
    enabled: boolParam(url.searchParams.get("statsPreflight"), true),
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
  const full = await refreshFullSimSnapshots().catch((error) => ({
    ok: false,
    warnings: [error instanceof Error ? error.message : "unknown full sim refresh error"]
  }));
  const market = await refreshSimMarketSnapshot().catch((error) => ({
    ok: false,
    warnings: [error instanceof Error ? error.message : "unknown market refresh error"]
  }));
  const mainMlb = await refreshMainMlbSimSnapshot().catch((error) => ({
    ok: false,
    warnings: [error instanceof Error ? error.message : "unknown main MLB refresh error"]
  }));

  const result = {
    ok: Boolean(statsPipeline.ok && full.ok && market.ok && mainMlb.ok),
    elapsedMs: Date.now() - startedAtMs,
    statsPipeline,
    full,
    market,
    mainMlb
  };

  console.info("[api/sim/refresh] completed", result);
  return result;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const startedAt = new Date().toISOString();
  const wait = url.searchParams.get("wait") === "1" || request.headers.get("x-vercel-cron") === "1";

  if (wait) {
    const result = await runRefresh(request);
    return NextResponse.json({ ...result, queued: false, startedAt }, { status: result.ok ? 200 : 207 });
  }

  after(async () => {
    await runRefresh(request);
  });

  return NextResponse.json({ ok: true, queued: true, startedAt }, { status: 202 });
}