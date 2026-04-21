import type { LeagueKey } from "@/lib/types/domain";

import type { CurrentOddsBoardResponse, CurrentOddsProvider } from "./provider-types";
import { getCurrentOddsBackendBaseUrl } from "./backend-url";

const LIVE_BACKEND_URL = getCurrentOddsBackendBaseUrl();

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];
const BACKEND_PROVIDER_TIMEOUT_MS = 10_000;

async function fetchBackendJson<T>(path: string) {
  try {
    const response = await fetch(`${LIVE_BACKEND_URL}${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(BACKEND_PROVIDER_TIMEOUT_MS)
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
