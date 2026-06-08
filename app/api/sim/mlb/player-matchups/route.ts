import { NextResponse } from "next/server";

import { buildMlbPlayerMatchupDiagnostics } from "@/services/simulation/mlb-player-matchup-diagnostics";
import { buildMlbV8PlayerImpactContext } from "@/services/simulation/mlb-v8-player-impact-model";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

function parseRequired(value: string | null, key: string) {
  const clean = String(value ?? "").trim();
  if (!clean) throw new Error(`Missing required query parameter: ${key}`);
  return clean;
}

function parseRuns(value: string | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(1.5, Math.min(9.5, parsed)) : fallback;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gameId = parseRequired(searchParams.get("gameId"), "gameId");
    const awayTeam = parseRequired(searchParams.get("awayTeam"), "awayTeam").toUpperCase();
    const homeTeam = parseRequired(searchParams.get("homeTeam"), "homeTeam").toUpperCase();
    const awayRuns = parseRuns(searchParams.get("awayRuns"), 4.3);
    const homeRuns = parseRuns(searchParams.get("homeRuns"), 4.5);

    const context = await buildMlbV8PlayerImpactContext({ gameId, awayTeam, homeTeam });
    if (!context.available || !context.away || !context.home) {
      return NextResponse.json({
        ok: false,
        modelVersion: "mlb-player-matchup-diagnostics-v1",
        gameId,
        awayTeam,
        homeTeam,
        reason: context.reason ?? "roster intelligence unavailable",
        diagnostics: null
      }, { status: 503 });
    }

    const diagnostics = buildMlbPlayerMatchupDiagnostics({
      away: context.away,
      home: context.home,
      awayRuns,
      homeRuns
    });

    return NextResponse.json({
      ok: true,
      gameId,
      awayTeam,
      homeTeam,
      awayRuns,
      homeRuns,
      diagnostics
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown player matchup diagnostics error";
    const status = message.startsWith("Missing required") ? 400 : 500;
    return NextResponse.json({
      ok: false,
      modelVersion: "mlb-player-matchup-diagnostics-v1",
      error: message
    }, { status });
  }
}
