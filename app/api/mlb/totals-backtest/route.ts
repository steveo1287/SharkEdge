import { NextResponse } from "next/server";

import { getCachedMlbTotalsBacktest, runMlbTotalsBacktest } from "@/services/simulation/mlb-totals-backtest-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function parseLimit(value: string | null) {
  const parsed = Number(value ?? 1500);
  return Number.isFinite(parsed) ? Math.max(25, Math.min(5000, Math.round(parsed))) : 1500;
}

function parseAction(value: string | null) {
  return value === "cached" ? "cached" : "run";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = parseAction(searchParams.get("action"));

  if (action === "cached") {
    const cached = await getCachedMlbTotalsBacktest();
    return NextResponse.json({ ok: Boolean(cached), cached }, { status: cached ? 200 : 404 });
  }

  const result = await runMlbTotalsBacktest(parseLimit(searchParams.get("limit")));
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const limit = typeof body.limit === "number" ? body.limit : 1500;
  const result = await runMlbTotalsBacktest(parseLimit(String(limit)));
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
