import { NextResponse } from "next/server";
import { runMlbBettingWarehouseRefresh, buildMlbBettingWarehouseHealth } from "@/services/mlb/mlb-betting-warehouse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(request: Request) {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const xKey = request.headers.get("x-api-key")?.trim();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!apiKey && !cronSecret) return true;
  return Boolean((apiKey && xKey === apiKey) || (cronSecret && bearer === cronSecret));
}

// GET → health check
export async function GET() {
  const health = await buildMlbBettingWarehouseHealth();
  return NextResponse.json(health);
}

// POST → trigger refresh
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const result = await runMlbBettingWarehouseRefresh();
  return NextResponse.json(result);
}
