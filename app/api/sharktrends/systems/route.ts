import { NextResponse } from "next/server";

import { listSharkTrendSystems, parseSystemInput, saveSharkTrendSystem } from "@/src/server/sharktrends/saved-systems";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const systems = await listSharkTrendSystems();
    return NextResponse.json({ ok: true, data: { systems }, warnings: [] });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "System list failed.", warnings: [] }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await saveSharkTrendSystem(parseSystemInput(body));
    return NextResponse.json(result.ok ? { ok: true, data: result, warnings: result.backtest.warnings } : result, { status: result.ok ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "System save failed.", warnings: [] }, { status: 400 });
  }
}
