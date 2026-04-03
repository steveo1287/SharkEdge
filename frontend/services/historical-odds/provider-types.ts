import type { LeagueKey } from "@/lib/types/domain";

export type HistoricalOddsCapability = {
  opening: boolean;
  closing: boolean;
  snapshots: boolean;
};

export type HistoricalOddsOutcome = {
  name: string | null;
  price: number | null;
  point: number | null;
};

export type HistoricalOddsBookmaker = {
  key: string;
  title: string;
  last_update?: string | null;
  markets: {
    moneyline: HistoricalOddsOutcome[];
    spread: HistoricalOddsOutcome[];
    total: HistoricalOddsOutcome[];
  };
};

export type HistoricalOddsGame = {
  id: string;
  commence_time: string | null;
  home_team: string;
  away_team: string;
  bookmakers_available: number;
  bookmakers: HistoricalOddsBookmaker[];
};

export type HistoricalOddsSportPayload = {
  key: string;
  title: string;
  short_title: string;
  game_count: number;
  games: HistoricalOddsGame[];
  note?: string;
  error?: string;
};

export type HistoricalOddsHarvestResponse = {
  configured: boolean;
  provider: "oddsharvester";
  source_type: "HARVESTED_HISTORICAL";
  generated_at: string;
  sport_count?: number;
  game_count?: number;
  message?: string;
  note?: string;
  errors?: string[];
  sports: HistoricalOddsSportPayload[];
};

export type HistoricalOddsIngestionResult = {
  sourceKey: "oddsharvester_historical";
  capturedAt: string;
  leagues: LeagueKey[];
  sportCount: number;
  gameCount: number;
  marketCount: number;
  snapshotCount: number;
};

export interface HistoricalOddsIngestionProvider {
  key: string;
  label: string;
  sourceType: "HARVESTED_HISTORICAL" | "VENDOR_API";
  supportsLeague(leagueKey: LeagueKey): boolean;
  capabilities: HistoricalOddsCapability;
  describe(): string;
}
