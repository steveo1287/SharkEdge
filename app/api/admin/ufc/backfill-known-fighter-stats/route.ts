import { NextResponse } from "next/server";

import { backfillKnownUfcFighterStats } from "@/services/ufc/ufcstats-known-fighter-backfill";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180;

function authorized(request: Request) {
  const url = new URL(request.url);
  const envSecret = process.env.UFC_ADMIN_RUN_TOKEN?.trim();
  if (envSecret) {
    const bearer = request.headers.get("authorization")?.replace(/^bearer\s+/i, "").trim();
    return url.searchParams.get("token") === envSecret || request.headers.get("x-api-key") === envSecret || bearer === envSecret;
  }
  return url.searchParams.get("confirm") === "backfill-known-fighter-stats";
}

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const parsed = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized", required: process.env.UFC_ADMIN_RUN_TOKEN ? "valid token" : "?confirm=backfill-known-fighter-stats" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = boolParam(url, "dryRun", true);
  const limit = numberParam(url, "limit", 40, 1, 100);
  const horizonDays = numberParam(url, "horizonDays", 180, 1, 365);

  try {
    const result = await backfillKnownUfcFighterStats({ dryRun, limit, horizonDays });
    return NextResponse.json(result, { status: result.ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
