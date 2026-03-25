import type { LeagueKey } from "@/lib/types/domain";

import type { HistoricalOddsIngestionProvider } from "./provider-types";

const SUPPORTED_HISTORICAL_LEAGUES: LeagueKey[] = [
  "NBA",
  "NCAAB",
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
    return "OddsHarvester is reserved for harvested historical odds snapshots and future CLV/trend analysis. It is not part of the live scoreboard request path.";
  }
};
