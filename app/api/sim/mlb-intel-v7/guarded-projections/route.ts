import { NextResponse } from "next/server";

import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { buildMainSimProjection } from "@/services/simulation/main-sim-brain";
import { buildSimProjection } from "@/services/simulation/sim-projection-engine";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
  scoreboard?: string | null;
};

function parseLimit(value: string | null) {
  const numeric = Number(value ?? 30);
  return Number.isFinite(numeric) ? Math.max(1, Math.min(60, Math.round(numeric))) : 30;
}

async function fetchMlbGames() {
  const sections = await buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null });
  return sections.flatMap((section) => section.leagueKey === "MLB"
    ? section.scoreboard.map((game) => ({ ...game, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel }))
    : []) as SimGame[];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const games = (await fetchMlbGames()).filter((game) => game.status !== "FINAL" && game.status !== "POSTPONED" && game.status !== "CANCELED");
  const rows = [];
  const warnings: string[] = [];

  for (const game of games.slice(0, limit)) {
    try {
      const rawProjection = await buildSimProjection(game);
      const mainProjection = await buildMainSimProjection(game);
      rows.push({
        game: {
          id: game.id,
          label: game.label,
          startTime: game.startTime,
          status: game.status
        },
        rawDistribution: rawProjection.distribution,
        guardedDistribution: mainProjection.distribution,
        governor: mainProjection.mlbIntel?.governor ?? null,
        mainBrain: (mainProjection.mlbIntel as { mainBrain?: unknown } | null | undefined)?.mainBrain ?? null,
        playerImpact: (mainProjection.mlbIntel as { playerImpact?: unknown } | null | undefined)?.playerImpact ?? null,
        v7: (mainProjection.mlbIntel as { v7?: unknown } | null | undefined)?.v7 ?? null,
        runModel: mainProjection.mlbIntel?.runModel ?? null,
        market: mainProjection.mlbIntel?.market ?? null,
        lock: mainProjection.mlbIntel?.lock ?? null
      });
    } catch (error) {
      warnings.push(`${game.label}: ${error instanceof Error ? error.message : "unknown main-brain projection error"}`);
    }
  }

  return NextResponse.json({
    ok: true,
    modelVersion: "main-sim-brain-v1",
    generatedAt: new Date().toISOString(),
    gameCount: games.length,
    rowCount: rows.length,
    warnings,
    rows
  });
}
