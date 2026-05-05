import type { BoardFilters, BoardPageData, LeagueKey } from "@/lib/types/domain";
import {
  getHomeCommandData,
  type HomeCommandData,
  type HomeDeskDateKey,
  type HomeLeagueScope
} from "@/services/home/home-command-service";

const VALID_HOME_DATES: HomeDeskDateKey[] = ["today", "tomorrow", "upcoming"];
const VALID_HOME_LEAGUES = ["ALL", "NBA", "MLB", "NHL", "NFL", "NCAAF", "UFC", "BOXING"];

function readValue(searchParams: Record<string, string | string[] | undefined>, key: string) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

function selectedLeague(searchParams: Record<string, string | string[] | undefined>): HomeLeagueScope {
  const value = readValue(searchParams, "league")?.toUpperCase();
  return (value && VALID_HOME_LEAGUES.includes(value) ? value : "ALL") as HomeLeagueScope;
}

function selectedDate(searchParams: Record<string, string | string[] | undefined>): HomeDeskDateKey {
  const value = readValue(searchParams, "date");
  return VALID_HOME_DATES.includes(value as HomeDeskDateKey) ? (value as HomeDeskDateKey) : "today";
}

function focusedLeague(league: HomeLeagueScope): LeagueKey {
  if (league === "ALL" || league === "BOXING") return "MLB";
  return league as LeagueKey;
}

function fallbackFilters(league: HomeLeagueScope, date: HomeDeskDateKey): BoardFilters {
  return {
    league,
    date: date === "upcoming" ? "all" : date,
    sportsbook: "best",
    market: "all",
    status: "all"
  } as BoardFilters;
}

function fallbackBoardData(filters: BoardFilters, reason: string): BoardPageData {
  return {
    filters,
    games: [],
    sportSections: [],
    source: "fallback",
    sourceNote: `Home recovery mode: ${reason}`,
    liveMessage: "Home command data failed upstream. Core navigation remains online while the live desk recovers.",
    providerHealth: {
      state: "FALLBACK",
      label: "Recovery mode",
      summary: "Home command data failed upstream. SharkEdge is serving a safe fallback instead of throwing.",
      freshnessLabel: "Recovery mode",
      freshnessMinutes: null,
      warnings: [reason]
    },
    summary: {
      totalGames: 0,
      liveGames: 0,
      completedGames: 0,
      upcomingGames: 0,
      bestBookCount: 0
    }
  } as BoardPageData;
}

function errorLabel(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown home command error";
}

export function buildFallbackHomeCommandData(
  searchParams: Record<string, string | string[] | undefined>,
  error: unknown
): HomeCommandData {
  const league = selectedLeague(searchParams);
  const date = selectedDate(searchParams);
  const filters = fallbackFilters(league, date);
  const reason = errorLabel(error);
  const boardData = fallbackBoardData(filters, reason);
  const focus = focusedLeague(league);

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
