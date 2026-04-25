import { NextResponse } from "next/server";

import type { BoardFilters, LeagueKey } from "@/lib/types/domain";
import { parseBoardFilters } from "@/services/odds/board-service";
import { getLiveBoardPageData } from "@/services/odds/live-board-data";

const SUPPORTED_LEAGUES = new Set<LeagueKey>([
  "NBA",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF",
  "UFC",
  "BOXING"
]);

function parseLeague(value: string | null): BoardFilters["league"] {
  const raw = value?.trim().toUpperCase() ?? null;

  if (!raw || raw === "ALL") {
    return "ALL";
  }

  return SUPPORTED_LEAGUES.has(raw as LeagueKey)
    ? (raw as LeagueKey)
    : "ALL";
}

function parseDate(value: string | null): BoardFilters["date"] {
  const raw = value?.trim().toLowerCase();
  if (!raw || raw === "upcoming") {
    return "all";
  }

  return raw;
}

function parseFilters(request: Request): BoardFilters {
  const { searchParams } = new URL(request.url);
  return parseBoardFilters({
    league: parseLeague(searchParams.get("league")),
    date: parseDate(searchParams.get("date")),
    sportsbook: searchParams.get("sportsbook") ?? "best",
    market: searchParams.get("market") ?? "all",
    status: searchParams.get("status") ?? "all"
  });
}

function buildFallback(filters: BoardFilters, reason: string) {
  return {
    ok: false,
    filters,
    source: "degraded_fallback",
    warnings: [reason],
    gameCount: 0,
    sample: []
  };
}

export async function GET(request: Request) {
  const filters = parseFilters(request);

  try {
    const payload = await getLiveBoardPageData(filters);
    const games = payload?.games ?? [];

    if (!payload) {
      return NextResponse.json(
        buildFallback(
          filters,
          "Live board payload was unavailable, so SharkEdge returned a safe degraded response."
        )
      );
    }

    return NextResponse.json({
      ok: true,
      filters,
      source: payload.source ?? null,
      warnings: payload.providerHealth?.warnings ?? [],
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
      buildFallback(
        filters,
        error instanceof Error
          ? `Live board request degraded safely after an internal error: ${error.message}`
          : "Live board request degraded safely after an internal error."
      )
    );
  }
}
