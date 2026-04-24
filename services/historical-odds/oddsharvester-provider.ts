import type { LeagueKey } from "@/lib/types/domain";

import type { HistoricalOddsIngestionProvider } from "./provider-types";

const SUPPORTED_HISTORICAL_LEAGUES: LeagueKey[] = [
  "NBA",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF"
];

export const oddsharvesterHistoricalProvider: HistoricalOddsIngestionProvider = {
  key: "oddsharvester",
  label: "OddsHarvester historical ingestion",
  sourceType: "HARVESTED_HISTORICAL",
  capabilities: {
    opening: true,
    closing: true,
    snapshots: true
  },
  supportsLeague(leagueKey: LeagueKey) {
    return SUPPORTED_HISTORICAL_LEAGUES.includes(leagueKey);
  },
  describe() {
    return "OddsHarvester is reserved for worker-only historical odds snapshots, opening/current/closing line movement, and CLV analysis. It is paced, cacheable, and kept out of the live request path.";
  }
};
