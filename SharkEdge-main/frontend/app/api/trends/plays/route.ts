import { NextResponse } from "next/server";

import { buildTrendPlays } from "@/services/trends/play-builder";
import type { TrendsPlaysResponse } from "@/services/trends/play-types";

export const dynamic = "force-dynamic";

function emptyResponse(issue: string): TrendsPlaysResponse {
  return {
    generatedAt: new Date().toISOString(),
    diagnostics: {
      historicalRows: 0,
      currentRows: 0,
      discoveredSystems: 0,
      validatedSystems: 0,
      activeCandidates: 0,
      surfacedPlays: 0,
      providerStatus: "down",
      issues: [issue]
    },
    bestPlays: [],
    buildingSignals: [],
    historicalSystems: []
  };
}

export async function GET() {
  try {
    const payload = await buildTrendPlays();
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to build trend plays.";
    return NextResponse.json(emptyResponse(message), { status: 200 });
  }
}

