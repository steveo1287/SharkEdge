import { NextResponse } from "next/server";

import { refreshFullSimSnapshots } from "@/services/simulation/sim-snapshot-service";

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
  const result = await refreshFullSimSnapshots();
  console.info(`[sim-refresh] completed ${Date.now() - startedAt}ms`);
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
