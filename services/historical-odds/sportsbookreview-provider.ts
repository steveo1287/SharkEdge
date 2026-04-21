import type { LeagueKey } from "@/lib/types/domain";

import type { HistoricalOddsIngestionProvider } from "./provider-types";

const SUPPORTED_LEAGUES: LeagueKey[] = ["NBA", "MLB", "NFL", "NHL"];

export const sportsbookReviewHistoricalProvider: HistoricalOddsIngestionProvider = {
  key: "sportsbookreview",
  label: "SportsbookReview historical import",
  sourceType: "HARVESTED_HISTORICAL",
  capabilities: {
    opening: true,
    closing: true,
    snapshots: true
  },
  supportsLeague(leagueKey: LeagueKey) {
    return SUPPORTED_LEAGUES.includes(leagueKey);
  },
  describe() {
    return "SportsbookReview exports can be imported into SharkEdge's historical market warehouse for extra closing-line, opener, and snapshot analysis.";
  }
};
