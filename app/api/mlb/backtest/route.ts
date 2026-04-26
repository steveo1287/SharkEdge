import { NextResponse } from "next/server";
import { runMlbBacktest, getCachedMlbBacktestWeights } from "@/services/simulation/mlb-backtesting-engine";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const weights = await getCachedMlbBacktestWeights();
  return NextResponse.json({ ok: true, weights });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  const result = await runMlbBacktest(limit);
  return NextResponse.json(result);
}
