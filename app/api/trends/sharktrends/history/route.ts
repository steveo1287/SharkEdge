import { NextResponse } from "next/server";

import { buildSharkTrendsGameHistory } from "@/services/trends/sharktrends-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 180;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const systemId = url.searchParams.get("systemId");

  try {
    const history = await buildSharkTrendsGameHistory(systemId);
    if (!history) {
      return NextResponse.json({
        ok: false,
        generatedAt: new Date().toISOString(),
        error: "SharkTrends system history not found.",
        systemId
      }, { status: 404 });
    }

    return NextResponse.json(history);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Failed to build SharkTrends game history.",
      systemId
    }, { status: 500 });
  }
}
