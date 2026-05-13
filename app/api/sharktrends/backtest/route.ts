import { NextResponse } from "next/server";

import { runSharkTrendBacktestFromRequest } from "@/src/server/sharktrends/backtest-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await runSharkTrendBacktestFromRequest(body);
    return NextResponse.json({ ok: true, data: result, warnings: result.warnings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Backtest failed.", warnings: [] }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, data: { message: "Use POST /api/sharktrends/backtest with input or filters." }, warnings: [] });
}
