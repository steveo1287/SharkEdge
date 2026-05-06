import { NextResponse } from "next/server";
import { getMlbLeagueTrends, getMlbTrendBrowserSummary } from "@/services/mlb/mlb-trend-browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minSample = Math.max(5, Math.min(500, Number(searchParams.get("minSample") ?? 20)));

  try {
    const [trends, summary] = await Promise.all([
      getMlbLeagueTrends(minSample),
      getMlbTrendBrowserSummary(),
    ]);

    return NextResponse.json({ ok: true, summary, trends, count: trends.length });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
