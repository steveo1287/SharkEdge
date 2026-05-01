import { NextResponse } from "next/server";

import { buildTrendsCenterSnapshot } from "@/services/trends/trends-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snapshot = await buildTrendsCenterSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Failed to build Trends Center snapshot."
    }, { status: 500 });
  }
}
