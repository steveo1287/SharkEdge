import { NextResponse } from "next/server";

import { auditHistoricalTrendData } from "@/services/trends/historical-data-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 180;

export async function GET() {
  try {
    return NextResponse.json(await auditHistoricalTrendData());
  } catch (error) {
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Historical trend audit failed."
    }, { status: 500 });
  }
}
