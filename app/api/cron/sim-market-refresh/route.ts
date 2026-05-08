import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

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
  console.info("[sim-market-refresh] started");

  const { refreshSimMarketSnapshot } = await import("@/services/simulation/sim-snapshot-service");
  const result = await refreshSimMarketSnapshot().catch((error) => ({
    ok: false,
    warnings: [error instanceof Error ? error.message : "unknown market refresh error"]
  }));

  const elapsedMs = Date.now() - startedAt;
  console.info(`[sim-market-refresh] completed ${elapsedMs}ms ok=${result.ok}`);

  return NextResponse.json({
    ok: Boolean(result.ok),
    queued: false,
    startedAt: new Date(startedAt).toISOString(),
    elapsedMs,
    result
  }, { status: result.ok ? 200 : 207 });
}
