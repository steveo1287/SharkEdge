import type { LeagueKey } from "@/lib/types/domain";

import type { MatchupStatsProvider } from "./provider-types";

export const boxingMatchupStatsProvider: MatchupStatsProvider = {
  key: "boxing-stats-scaffold",
  label: "Boxing metadata scaffold",
  kind: "SCAFFOLD",
  supportsLeague(leagueKey: LeagueKey) {
    return leagueKey === "BOXING";
  },
  async fetchMatchupDetail() {
    return null;
  }
};
