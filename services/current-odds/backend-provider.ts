import type { LeagueKey } from "@/lib/types/domain";

import type {
  CurrentOddsBoardResponse,
  CurrentOddsProvider,
  CurrentOddsSport
} from "./provider-types";
import {
  getCurrentOddsBackendBaseUrl,
  hasCurrentOddsBackendBaseUrl
} from "./backend-url";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];
const BACKEND_PROVIDER_TIMEOUT_MS = 2_500;

type OddsHarvesterHarvestResponse = {
  configured: boolean;
  generated_at: string;
  provider?: string | null;
  errors?: string[];
  sports: CurrentOddsSport[];
};

async function fetchBackendJson<T>(path: string) {
  if (process.env.npm_lifecycle_event === "build" || !hasCurrentOddsBackendBaseUrl()) {
    return null;
  }

  const baseUrl = getCurrentOddsBackendBaseUrl();
  if (!baseUrl) {
    return null;
  }

  try {
    const response = await fetch(`${baseUrl}${path}`, {
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
    if (!hasCurrentOddsBackendBaseUrl()) {
      return null;
    }

    const [boardResponse, harvestResponse] = await Promise.all([
      fetchBackendJson<CurrentOddsBoardResponse>("/api/odds/board"),
      fetchBackendJson<OddsHarvesterHarvestResponse>("/api/historical/odds/harvest")
    ]);

    if (boardResponse?.configured && Array.isArray(boardResponse.sports) && boardResponse.sports.length > 0) {
      return { ...boardResponse, errors: [] };
    }

    if (harvestResponse?.configured && Array.isArray(harvestResponse.sports) && harvestResponse.sports.length > 0) {
      return {
        configured: true,
        generated_at: harvestResponse.generated_at,
        provider: harvestResponse.provider ?? "oddsharvester",
        provider_mode: harvestResponse.provider ?? "oddsharvester",
        bookmakers: "",
        errors: [],
        sports: harvestResponse.sports
      };
    }

    return boardResponse?.configured ? boardResponse : null;
  }
};
