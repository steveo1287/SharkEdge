import { NextResponse } from "next/server";

import { getPropsApi } from "@/services/feed/feed-api";

function buildDegradedPropsPayload(reason: string) {
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
    const payload = await getPropsApi();
    return NextResponse.json(payload ?? buildDegradedPropsPayload("Props payload was unavailable, so SharkEdge returned a safe degraded response."));
  } catch (error) {
    return NextResponse.json(
      buildDegradedPropsPayload(
        error instanceof Error
          ? `Props request degraded safely after an internal error: ${error.message}`
          : "Props request degraded safely after an internal error."
      )
    );
  }
}
