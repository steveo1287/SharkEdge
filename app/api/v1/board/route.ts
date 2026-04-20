import { NextResponse } from "next/server";

import type { BoardFilters, LeagueKey } from "@/lib/types/domain";
import { parseBoardFilters } from "@/services/odds/board-service";
import { getBoardFeed } from "@/services/market-data/market-data-service";

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

export async function GET(request: Request) {
  const filters = parseFilters(request);
  const leagueKey = filters.league === "ALL" ? undefined : filters.league;

  try {
    const payload = await getBoardFeed(leagueKey, {
      status: filters.status,
      date: filters.date
    });

    return NextResponse.json({
      ...payload,
      filters,
      source: "internal_market_store",
      // Backward-compatible shape for any legacy consumer still expecting `events`.
      events: payload.events ?? []
    });
  } catch (error) {
    return NextResponse.json(
      {
        filters,
        error: error instanceof Error ? error.message : "Failed to load board."
      },
      { status: 500 }
    );
  }
}
