import { NextResponse } from "next/server";

import { buildMarketDataSourceSummary } from "@/services/trends/market-data-source";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const payload = await buildMarketDataSourceSummary();
  return NextResponse.json({ ok: true, ...payload });
}
