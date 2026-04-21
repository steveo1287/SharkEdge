import type { LeagueKey } from "@/lib/types/domain";

import type {
  CurrentOddsBoardResponse,
  CurrentOddsProvider,
  CurrentOddsSport
} from "./provider-types";
import { getCurrentOddsBackendBaseUrl } from "./backend-url";

const LIVE_BACKEND_URL = getCurrentOddsBackendBaseUrl();

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];
const BACKEND_PROVIDER_TIMEOUT_MS = 10_000;

type OddsHarvesterHarvestResponse = {
  configured: boolean;
  generated_at: string;
  provider?: string | null;
  errors?: string[];
  sports: CurrentOddsSport[];
};

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
    const [boardResponse, harvestResponse] = await Promise.all([
      fetchBackendJson<CurrentOddsBoardResponse>("/api/odds/board"),
      fetchBackendJson<OddsHarvesterHarvestResponse>("/api/historical/odds/harvest")
    ]);

    if (harvestResponse?.configured && harvestResponse.provider === "oddsharvester") {
      return {
        configured: true,
        generated_at: harvestResponse.generated_at,
        provider: "oddsharvester",
        provider_mode: boardResponse?.provider_mode ?? "oddsharvester",
        bookmakers: boardResponse?.bookmakers ?? "",
        errors: harvestResponse.errors ?? boardResponse?.errors ?? [],
        sports: harvestResponse.sports
      };
    }

    if (boardResponse?.configured && boardResponse.provider === "oddsharvester") {
      return boardResponse;
    }

    return null;
  }
};
