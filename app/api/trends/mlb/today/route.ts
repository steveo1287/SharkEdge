import { NextResponse } from "next/server";
import { getMlbTodayActivations } from "@/services/mlb/mlb-trend-browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const games = await getMlbTodayActivations();
    return NextResponse.json({ ok: true, games, count: games.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
