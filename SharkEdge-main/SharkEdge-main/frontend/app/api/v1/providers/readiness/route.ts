import { NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { getLiveOddsReadinessReport } from "@/services/current-odds/provider-readiness-service";

const SUPPORTED_LEAGUES = new Set<LeagueKey>(["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"]);

function parseLeagues(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("leagues")?.trim();
  if (!raw) {
    return undefined;
  }

  const leagues = raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is LeagueKey => SUPPORTED_LEAGUES.has(value as LeagueKey));

  return leagues.length ? leagues : undefined;
}

export async function GET(request: Request) {
  try {
    const report = await getLiveOddsReadinessReport({ leagues: parseLeagues(request) });
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load provider readiness report."
      },
      {
        status: 500
      }
    );
  }
}
