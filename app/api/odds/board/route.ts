import { NextResponse } from "next/server";

import type { BoardFilters, BoardPageData, LeagueKey } from "@/lib/types/domain";
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

  return SUPPORTED_LEAGUES.has(raw as LeagueKey) ? (raw as LeagueKey) : "ALL";
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
  const scope = searchParams.get("sport_key") ?? searchParams.get("league");

  return parseBoardFilters({
    league: parseLeague(scope),
    date: parseDate(searchParams.get("date")),
    sportsbook: searchParams.get("sportsbook") ?? "best",
    market: searchParams.get("market") ?? "all",
    status: searchParams.get("status") ?? "all"
  });
}

async function getSnapshotFirstBoardPageData(filters: BoardFilters): Promise<BoardPageData | null> {
  const snapshotPayload = await getBoardSnapshotPageData(filters);
  if (snapshotPayload) {
    return snapshotPayload;
  }

  if (liveFallbackAllowed()) {
    return getBoardPageData(filters);
  }

  return null;
}

export async function GET(request: Request) {
  const filters = parseFilters(request);

  try {
    const payload = await getSnapshotFirstBoardPageData(filters);
    if (!payload) {
      return NextResponse.json({
        configured: false,
        generated_at: new Date().toISOString(),
        provider: "snapshot",
        provider_mode: "snapshot",
        bookmakers: "",
        errors: [
          "No precomputed board snapshot was available. Live board fallback is disabled. Run npm run shark:snapshot or set SHARKEDGE_BOARD_SNAPSHOT_URL."
        ],
        sports: []
      });
    }

    const sports = payload.sportSections
      .map((section) => {
        const games = section.games.map((game) => ({
          id: game.id,
          commence_time: game.startTime,
          home_team: game.homeTeam.name,
          away_team: game.awayTeam.name,
          bookmakers_available: game.bestBookCount,
          bookmakers: [],
          market_stats: {
            moneyline: [game.moneyline],
            spread: [game.spread],
            total: [game.total]
          }
        }));

        return {
          key: section.leagueKey.toLowerCase(),
          title: section.leagueLabel,
          short_title: section.leagueKey,
          game_count: games.length,
          games
        };
      })
      .filter((sport) => sport.game_count > 0);

    return NextResponse.json({
      configured: payload.providerHealth.state !== "OFFLINE",
      generated_at: payload.providerHealth.asOf ?? new Date().toISOString(),
      provider: payload.source,
      provider_mode: "snapshot",
      bookmakers: payload.sportsbooks?.map((sb) => sb.name).join(", ") ?? "best",
      errors: payload.providerHealth.warnings,
      sports
    });
  } catch (error) {
    return NextResponse.json({
      configured: false,
      generated_at: new Date().toISOString(),
      provider: null,
      provider_mode: null,
      bookmakers: "",
      errors: [
        error instanceof Error
          ? `Board endpoint failed: ${error.message}`
          : "Board endpoint failed."
      ],
      sports: []
    });
  }
}
