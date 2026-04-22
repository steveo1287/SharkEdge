import { NextResponse } from "next/server";

import { getLineMovementsApi } from "@/services/feed/feed-api";

function buildFallback(reason: string) {
  return {
    generatedAt: new Date().toISOString(),
    count: 0,
    source: "degraded_fallback",
    note: reason,
    data: []
  };
}

export async function GET() {
  try {
    const payload = await getLineMovementsApi();
    return NextResponse.json(payload ?? buildFallback("Line movements payload was unavailable."));
  } catch (error) {
    return NextResponse.json(
      buildFallback(
        error instanceof Error
          ? `Line movements request degraded safely: ${error.message}`
          : "Line movements request degraded safely."
      )
    );
  }
}
