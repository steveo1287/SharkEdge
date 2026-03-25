import type { LeagueKey } from "@/lib/types/domain";

import type { CurrentOddsBoardResponse, CurrentOddsProvider } from "./provider-types";

const LIVE_BACKEND_URL =
  process.env.SHARKEDGE_BACKEND_URL?.trim() || "https://shark-odds-1.onrender.com";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];

async function fetchBackendJson<T>(path: string) {
  try {
    const response = await fetch(`${LIVE_BACKEND_URL}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export const backendCurrentOddsProvider: CurrentOddsProvider = {
  key: "current-odds-backend",
  label: "Current odds backend",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  async fetchBoard() {
    const response = await fetchBackendJson<CurrentOddsBoardResponse>("/api/odds/board");

    if (!response?.configured) {
      return null;
    }

    return response;
  }
};
