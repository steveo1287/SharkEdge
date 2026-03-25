import type { LeagueKey } from "@/lib/types/domain";

export type HistoricalOddsCapability = {
  opening: boolean;
  closing: boolean;
  snapshots: boolean;
};

export interface HistoricalOddsIngestionProvider {
  key: string;
  label: string;
  sourceType: "HARVESTED_HISTORICAL";
  supportsLeague(leagueKey: LeagueKey): boolean;
  capabilities: HistoricalOddsCapability;
  describe(): string;
}
