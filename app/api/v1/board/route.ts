import { NextResponse } from "next/server";

import type { BoardFilters, LeagueKey } from "@/lib/types/domain";
import { getBoardPageData, parseBoardFilters } from "@/services/odds/board-service";

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

function buildDegradedBoardResponse(filters: BoardFilters, reason: string) {
  return {
    filters,
    availableDates: [],
    leagues: filters.league === "ALL" ? [] : [],
    sportsbooks: [{ id: "best", key: "best", name: "Best available", region: "US" }],
    games: [],
    events: [],
    sportSections: [],
    snapshots: [],
    summary: { totalGames: 0, totalProps: 0, totalSportsbooks: 0 },
    liveMessage: null,
    source: "mock",
    sourceNote: reason,
    providerHealth: {
      state: "DEGRADED",
      label: "Degraded",
      summary: reason,
      warnings: [reason]
    }
  };
}

export async function GET(request: Request) {
  const filters = parseFilters(request);

  try {
    const payload = await getBoardPageData(filters);
    if (!payload) {
      return NextResponse.json(
        buildDegradedBoardResponse(
          filters,
          "Live board payload was unavailable, so SharkEdge returned a safe degraded board response instead of throwing."
        )
      );
    }

    return NextResponse.json({
      ...payload,
      // Backward-compatible shape for any legacy consumer still expecting `events`.
      events: payload.games.map((game) => ({
        id: game.id,
        eventKey: game.externalEventId ?? game.id,
        league: game.leagueKey,
        name: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
        startTime: game.startTime,
        status: game.status,
        participants: [
          { role: "AWAY", competitor: game.awayTeam.name },
          { role: "HOME", competitor: game.homeTeam.name }
        ],
        markets: []
      }))
    });
  } catch (error) {
    return NextResponse.json(
      buildDegradedBoardResponse(
        filters,
        error instanceof Error
          ? `Board request degraded safely after an internal error: ${error.message}`
          : "Board request degraded safely after an internal error."
      )
    );
  }
}
