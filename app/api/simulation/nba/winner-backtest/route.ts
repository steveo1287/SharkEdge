import { NextResponse } from "next/server";

import { runNbaWinnerBacktest } from "@/services/backtesting/nba-winner-backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "5000");
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 10000)) : 5000;
  const report = await runNbaWinnerBacktest({ limit });
  return NextResponse.json(report);
}
