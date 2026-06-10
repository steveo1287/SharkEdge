import { NextResponse } from "next/server";

import type { BoardFilters, LeagueKey } from "@/lib/types/domain";
import { getBoardSnapshotPageData } from "@/services/board/snapshot-board-service";
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

function liveFallbackAllowed() {
  return process.env.SHARKEDGE_ALLOW_LIVE_BOARD_FALLBACK === "true";
}

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
      state: "FALLBACK",
      label: "Snapshot pending",
      summary: reason,
      freshnessLabel: "No board snapshot loaded",
      freshnessMinutes: null,
      asOf: null,
      warnings: [reason]
    }
  };
}

async function getSnapshotFirstBoardPageData(filters: BoardFilters) {
  const snapshotPayload = await getBoardSnapshotPageData(filters);
  if (snapshotPayload) {
    return snapshotPayload;
  }

  if (liveFallbackAllowed()) {
    return getBoardPageData(filters);
  }

  return buildDegradedBoardResponse(
    filters,
    "No precomputed board snapshot was available. Live board fallback is disabled. Run npm run shark:snapshot or set SHARKEDGE_BOARD_SNAPSHOT_URL."
  );
}

export async function GET(request: Request) {
  const filters = parseFilters(request);

  try {
    const payload = await getSnapshotFirstBoardPageData(filters);
    if (!payload) {
      return NextResponse.json(
        buildDegradedBoardResponse(
          filters,
          "Board payload was unavailable, so SharkEdge returned a safe degraded board response instead of throwing."
        )
      );
    }

    return NextResponse.json({
      ...payload,
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
