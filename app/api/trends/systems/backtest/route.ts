import { NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { PUBLISHED_SYSTEMS } from "@/services/trends/trend-system-engine";
import { runTrendSystemBacktests } from "@/services/trends/trend-system-ledger";

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
    const systemId = url.searchParams.get("systemId")?.trim() ?? "";
    const systems = PUBLISHED_SYSTEMS.filter((system) => {
      if (league !== "ALL" && system.league !== league) return false;
      if (systemId && system.id !== systemId) return false;
      return true;
    });
    const backtest = await runTrendSystemBacktests(systems);

    return NextResponse.json({
      ok: true,
      league,
      systemId: systemId || null,
      ...backtest,
      nextAction: backtest.summary.ledgerBacked
        ? "At least one published trend system is using ledger-backed historical rows."
        : "All systems are using seeded fallback metrics. Check database URL, migrations, and historical event market/result ingestion."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to run trend system backtest."
    }, { status: 500 });
  }
}
