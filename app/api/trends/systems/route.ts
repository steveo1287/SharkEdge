import { NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { buildTrendSystemRun } from "@/services/trends/trend-system-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function readLeague(value: string | null): LeagueKey | "ALL" {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "NBA" ||
    normalized === "MLB" ||
    normalized === "NHL" ||
    normalized === "NFL" ||
    normalized === "NCAAF" ||
    normalized === "NCAAB" ||
    normalized === "UFC" ||
    normalized === "BOXING"
  ) {
    return normalized as LeagueKey;
  }
  return "ALL";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const league = readLeague(url.searchParams.get("league"));
    const includeInactive = url.searchParams.get("inactive") === "true";
    const run = await buildTrendSystemRun({ league, includeInactive });

    return NextResponse.json({
      ok: true,
      ...run,
      nextAction: run.summary.activeMatches
        ? run.summary.actionableMatches
          ? "Published trend systems have active actionable matches. Review activeMatches before acting."
          : "Published trend systems have active watchlist matches. Confirm current price before acting."
        : "No published systems currently match the warmed sim slate."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to build trend systems."
    }, { status: 500 });
  }
}
