import { NextResponse } from "next/server";

import { gradePendingMlbPlayerPropInningLedgers } from "@/services/simulation/mlb-player-prop-inning-grader";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null;
  const cronSecret = process.env.CRON_SECRET?.trim() || process.env.INTERNAL_API_KEY?.trim() || process.env.INTERNAL_API_KEY2?.trim();
  if (cronSecret && bearer === cronSecret) return true;
  if (cronSecret && request.headers.get("x-cron-secret") === cronSecret) return true;
  const url = new URL(request.url);
  return url.searchParams.get("confirm") === "mlb-player-prop-inning-grade";
}

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const value = url.searchParams.get(name);
  const parsed = value ? Number(value) : fallback;
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = numberParam(url, "limit", 1000, 1, 5000);
  const dryRun = boolParam(url, "dryRun", false);
  const startedAt = new Date().toISOString();
  const result = await gradePendingMlbPlayerPropInningLedgers({ limit, dryRun });

  return NextResponse.json({
    ok: result.ok,
    mode: dryRun ? "dry-run" : "grade",
    startedAt,
    finishedAt: new Date().toISOString(),
    config: { limit, dryRun },
    result
  }, { status: result.ok ? 200 : 207 });
}

export async function POST(request: Request) {
  return GET(request);
}
