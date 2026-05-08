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

async function runRefresh() {
  const { refreshFullSimSnapshots, refreshSimMarketSnapshot } = await import("@/services/simulation/sim-snapshot-service");
  const { refreshMainMlbSimSnapshot } = await import("@/services/simulation/main-sim-snapshot-service");

  const startedAtMs = Date.now();
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
    ok: Boolean(full.ok && market.ok && mainMlb.ok),
    elapsedMs: Date.now() - startedAtMs,
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
    const result = await runRefresh();
    return NextResponse.json({ ...result, queued: false, startedAt }, { status: result.ok ? 200 : 207 });
  }

  after(async () => {
    await runRefresh();
  });

  return NextResponse.json({ ok: true, queued: true, startedAt }, { status: 202 });
}
