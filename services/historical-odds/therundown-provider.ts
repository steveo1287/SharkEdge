import type { LeagueKey } from "@/lib/types/domain";

import type { HistoricalOddsIngestionProvider } from "./provider-types";

const THERUNDOWN_SUPPORTED_LEAGUES: LeagueKey[] = [
  "NBA",
  "MLB",
  "NHL",
  "NFL",
  "NCAAF"
];

export const therundownHistoricalProvider: HistoricalOddsIngestionProvider = {
  key: "therundown",
  label: "The Rundown historical odds",
  sourceType: "VENDOR_API",
  capabilities: {
    opening: true,
    closing: true,
    snapshots: true
  },
  supportsLeague(leagueKey: LeagueKey) {
    return THERUNDOWN_SUPPORTED_LEAGUES.includes(leagueKey);
  },
  describe() {
    return "The Rundown is the clean paid upgrade path for sportsbook-grade historical odds, line movement, and prop coverage.";
  }
};
