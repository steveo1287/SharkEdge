import { NextResponse } from "next/server";

import { runSavedSharkTrendSystem } from "@/src/server/sharktrends/saved-systems";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const result = await runSavedSharkTrendSystem(id);
    if (!result) return NextResponse.json({ ok: false, error: "System not found.", warnings: [] }, { status: 404 });
    return NextResponse.json({ ok: true, data: result, warnings: result.backtest.warnings });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Saved system run failed.", warnings: [] }, { status: 500 });
  }
}
