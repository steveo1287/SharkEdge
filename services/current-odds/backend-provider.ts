import type { LeagueKey } from "@/lib/types/domain";

import type { CurrentOddsBoardResponse, CurrentOddsProvider } from "./provider-types";
import { getCurrentOddsBackendBaseUrl } from "./backend-url";

const LIVE_BACKEND_URL = getCurrentOddsBackendBaseUrl();

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];
const BACKEND_PROVIDER_TIMEOUT_MS = 2_500;
const BACKEND_BOARD_CACHE_TTL_MS = 10 * 60_000;

type BackendBoardCache = {
  generatedAtMs: number;
  payload: CurrentOddsBoardResponse | null;
};

declare global {
  // eslint-disable-next-line no-var
  var sharkedgeBackendBoardCache: BackendBoardCache | undefined;
}

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

function getCachedBackendBoard() {
  const cached = global.sharkedgeBackendBoardCache;
  if (!cached?.payload) {
    return null;
  }

  if (Date.now() - cached.generatedAtMs > BACKEND_BOARD_CACHE_TTL_MS) {
    return null;
  }

  return cached.payload;
}

export const backendCurrentOddsProvider: CurrentOddsProvider = {
  key: "current-odds-backend",
  label: "Current odds backend",
  supportsLeague(leagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  async fetchBoard() {
    const response = await fetchBackendJson<CurrentOddsBoardResponse>("/api/odds/board");

    if (response?.configured) {
      global.sharkedgeBackendBoardCache = {
        generatedAtMs: Date.now(),
        payload: response
      };
      return response;
    }

    const cached = getCachedBackendBoard();
    if (!cached) {
      return null;
    }

    return {
      ...cached,
      errors: Array.from(
        new Set([
          ...(cached.errors ?? []),
          "Backend board request failed; serving the last good backend board snapshot."
        ])
      )
    } satisfies CurrentOddsBoardResponse;
  }
};
