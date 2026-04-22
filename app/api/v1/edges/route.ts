import { NextResponse } from "next/server";

import { getEdgesApi } from "@/services/feed/feed-api";

function buildDegradedEdgesPayload(reason: string) {
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
    const payload = await getEdgesApi();
    return NextResponse.json(payload ?? buildDegradedEdgesPayload("Edges payload was unavailable, so SharkEdge returned a safe degraded response."));
  } catch (error) {
    return NextResponse.json(
      buildDegradedEdgesPayload(
        error instanceof Error
          ? `Edges request degraded safely after an internal error: ${error.message}`
          : "Edges request degraded safely after an internal error."
      )
    );
  }
}
