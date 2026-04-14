import type { SupportedLeagueKey } from "@/lib/types/ledger";

import type { EventProvider } from "./provider-types";

export const boxingEventProvider: EventProvider = {
  key: "boxing-scaffold",
  label: "Boxing adapter scaffold",
  kind: "SCAFFOLD",
  supportsLeague(leagueKey: SupportedLeagueKey) {
    return leagueKey === "BOXING";
  },
  async fetchScoreboard() {
    return [];
  }
};
