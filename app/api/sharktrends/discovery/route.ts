import { NextResponse } from "next/server";

import { getSharkTrendDiscovery } from "@/src/server/sharktrends/discovery-miner";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 24);
  const rowLimit = Number(url.searchParams.get("rowLimit") ?? 25000);
  try {
    const data = await getSharkTrendDiscovery({ limit, rowLimit });
    return NextResponse.json({ ok: true, data, warnings: data.warnings });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "SharkTrends discovery failed.", warnings: [] },
      { status: 500 }
    );
  }
}
