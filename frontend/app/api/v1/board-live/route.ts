import { NextResponse } from "next/server";

import type { BoardFilters, LeagueKey } from "@/lib/types/domain";
import { getLiveBoardPageData } from "@/services/odds/live-board-data";

const SUPPORTED_LEAGUES = new Set<LeagueKey>([
  "NBA",
  "NCAAB",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
]);

function parseLeague(request: Request): BoardFilters["league"] {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("league")?.trim().toUpperCase() ?? null;

  if (!raw || raw === "ALL") {
    return "ALL";
  }

  return (SUPPORTED_LEAGUES.has(raw as LeagueKey) ? (raw as LeagueKey) : "ALL") as BoardFilters["league"];
}

export async function GET(request: Request) {
  const filters: BoardFilters = {
    league: parseLeague(request),
    date: "today",
    sportsbook: "best",
    market: "all",
    status: "all"
  };

  try {
    const payload = await getLiveBoardPageData(filters);
    const games = payload?.games ?? [];

    return NextResponse.json({
      ok: Boolean(payload),
      filters,
      source: payload?.source ?? null,
      warnings: payload?.providerHealth?.warnings ?? [],
      gameCount: games.length,
      sample: games.slice(0, 5).map((game) => ({
        id: game.id,
        league: game.leagueKey,
        label: `${game.awayTeam.abbreviation} @ ${game.homeTeam.abbreviation}`,
        moneyline: { lineLabel: game.moneyline.lineLabel, bestOdds: game.moneyline.bestOdds, bestBook: game.moneyline.bestBook },
        spread: { lineLabel: game.spread.lineLabel, bestOdds: game.spread.bestOdds, bestBook: game.spread.bestBook },
        total: { lineLabel: game.total.lineLabel, bestOdds: game.total.bestOdds, bestBook: game.total.bestBook }
      }))
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        filters,
        error: error instanceof Error ? error.message : "Failed to load live board data."
      },
      { status: 500 }
    );
  }
}
