import type { BoardFilters, BoardPageData, LeagueKey } from "@/lib/types/domain";
import {
  getHomeCommandData,
  type HomeCommandData,
  type HomeDeskDateKey,
  type HomeLeagueScope
} from "@/services/home/home-command-service";

const VALID_HOME_DATES: HomeDeskDateKey[] = ["today", "tomorrow", "upcoming"];
const VALID_HOME_LEAGUES: HomeLeagueScope[] = ["ALL", "NBA", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"];

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function selectedLeague(searchParams: Record<string, string | string[] | undefined>): HomeLeagueScope {
  const value = readValue(searchParams, "league")?.toUpperCase() as HomeLeagueScope | undefined;
  return value && VALID_HOME_LEAGUES.includes(value) ? value : "ALL";
}

function selectedDate(searchParams: Record<string, string | string[] | undefined>): HomeDeskDateKey {
  const value = readValue(searchParams, "date");
  return VALID_HOME_DATES.includes(value as HomeDeskDateKey) ? (value as HomeDeskDateKey) : "today";
}

function focusedLeague(league: HomeLeagueScope): LeagueKey {
  if (league === "ALL") return "MLB";
  return league;
}

function fallbackFilters(league: HomeLeagueScope, date: HomeDeskDateKey): BoardFilters {
  return {
    league,
    date: date === "upcoming" ? "all" : date,
    sportsbook: "best",
    market: "all",
    status: "all"
  };
}

function publicErrorLabel(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  if (lower.includes("can't reach database") || lower.includes("database server") || lower.includes("prisma")) {
    return "Database is unavailable. SharkEdge is serving recovery mode until the data service comes back online.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Live data request timed out. SharkEdge is serving recovery mode until the next refresh.";
  }
  return "Home command data failed upstream. SharkEdge is serving recovery mode instead of throwing.";
}

function fallbackBoardData(filters: BoardFilters, reason: string, focus: LeagueKey): BoardPageData {
  const now = new Date().toISOString();

  return {
    filters,
    availableDates: [],
    leagues: [
      {
        id: `fallback-${focus.toLowerCase()}`,
        key: focus,
        name: focus,
        sport:
          focus === "MLB"
            ? "BASEBALL"
            : focus === "NHL"
              ? "HOCKEY"
              : focus === "NFL" || focus === "NCAAF"
                ? "FOOTBALL"
                : focus === "UFC"
                  ? "MMA"
                  : focus === "BOXING"
                    ? "BOXING"
                    : "BASKETBALL",
        createdAt: now,
        updatedAt: now
      }
    ],
    sportsbooks: [],
    games: [],
    sportSections: [],
    snapshots: [],
    source: "mock",
    sourceNote: `Home recovery mode: ${reason}`,
    liveMessage: "Home command data failed upstream. Core navigation remains online while the live desk recovers.",
    providerHealth: {
      state: "FALLBACK",
      label: "Recovery mode",
      summary: reason,
      freshnessLabel: "Recovery mode",
      freshnessMinutes: null,
      asOf: now,
      warnings: [reason]
    },
    summary: {
      totalGames: 0,
      totalProps: 0,
      totalSportsbooks: 0
    }
  };
}

export function buildFallbackHomeCommandData(
  searchParams: Record<string, string | string[] | undefined>,
  error: unknown
): HomeCommandData {
  const league = selectedLeague(searchParams);
  const date = selectedDate(searchParams);
  const filters = fallbackFilters(league, date);
  const reason = publicErrorLabel(error);
  const focus = focusedLeague(league);
  const boardData = fallbackBoardData(filters, reason, focus);

  return {
    selectedLeague: league,
    selectedDate: date,
    focusedLeague: focus,
    boardFilters: filters,
    boardData,
    liveBoardData: null,
    liveDeskAvailable: false,
    liveDeskMessage: boardData.liveMessage ?? null,
    liveDeskFreshnessLabel: "Recovery mode",
    liveDeskFreshnessMinutes: null,
    deskStatusState: "FALLBACK",
    deskStatusLabel: "Recovery mode",
    deskSourceNote: boardData.sourceNote,
    verifiedGames: [],
    movementGames: [],
    topProps: [],
    topActionables: [],
    decisionWindows: [],
    traps: []
  };
}

export async function getSafeHomeCommandData(
  searchParams: Record<string, string | string[] | undefined>
): Promise<HomeCommandData> {
  try {
    return await getHomeCommandData(searchParams);
  } catch (error) {
    console.error("[home-command] safe fallback activated", error);
    return buildFallbackHomeCommandData(searchParams, error);
  }
}
