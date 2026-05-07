import { NextResponse } from "next/server";

import { runMlbBettingWarehouseRefresh } from "@/services/mlb/mlb-betting-warehouse";
import { runMlbGameSpineIngestion, runMlbSeasonBackfill } from "@/services/mlb/mlb-game-spine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(request: Request) {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const xKey = request.headers.get("x-api-key")?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!apiKey && !cronSecret) return true;
  return Boolean((apiKey && xKey === apiKey) || (cronSecret && bearer === cronSecret));
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as { seasons?: number[]; refreshWarehouse?: boolean };
  const seasons: number[] | undefined = Array.isArray(body.seasons) ? body.seasons : undefined;
  const refreshWarehouse = body.refreshWarehouse !== false;

  const started = Date.now();
  const backfill = await runMlbSeasonBackfill(seasons);
  const rolling = await runMlbGameSpineIngestion().catch((err) => ({ ok: false, error: String(err) }));
  const warehouse = refreshWarehouse
    ? await runMlbBettingWarehouseRefresh().catch((err) => ({ ok: false, error: String(err) }))
    : null;

  return NextResponse.json({
    ok: backfill.ok,
    durationMs: Date.now() - started,
    backfill,
    rolling,
    warehouse
  });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const seasonsParam = url.searchParams.get("seasons");
  const seasons = seasonsParam
    ? seasonsParam.split(",").map(Number).filter((n) => n > 2000 && n <= 2030)
    : undefined;
  const refreshWarehouse = url.searchParams.get("warehouse") !== "false";

  const started = Date.now();
  const backfill = await runMlbSeasonBackfill(seasons);
  const rolling = await runMlbGameSpineIngestion().catch((err) => ({ ok: false, error: String(err) }));
  const warehouse = refreshWarehouse
    ? await runMlbBettingWarehouseRefresh().catch((err) => ({ ok: false, error: String(err) }))
    : null;

  return NextResponse.json({
    ok: backfill.ok,
    durationMs: Date.now() - started,
    backfill,
    rolling,
    warehouse
  });
}

