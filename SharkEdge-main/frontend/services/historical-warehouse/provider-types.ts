import type { SupportedLeagueKey, SupportedSportCode } from "@/lib/types/ledger";

export type FreeHistoricalSourceKey =
  | "nflverse"
  | "sportsdataverse_nba"
  | "sportsdataverse_ncaab"
  | "sportsdataverse_ncaaf"
  | "mlb_statsapi"
  | "lahman"
  | "nhl_public_api";

export type FreeHistoricalImportArgs = {
  leagues?: SupportedLeagueKey[];
  days?: number;
  startDate?: Date;
  endDate?: Date;
};

export type FreeHistoricalFeatureSummary = {
  importedGames: number;
  finalizedGames: number;
  averageTotalPoints: number | null;
  averageMargin: number | null;
  recentFormWindow: number;
  homeWinRate: number | null;
};

export type FreeHistoricalLeagueResult = {
  leagueKey: SupportedLeagueKey;
  sportCode: SupportedSportCode;
  sourceKey: FreeHistoricalSourceKey;
  importedCount: number;
  skippedCount: number;
  featureSummary: FreeHistoricalFeatureSummary;
  note: string;
};

export type FreeHistoricalImportResult = {
  generatedAt: string;
  leagues: FreeHistoricalLeagueResult[];
  importedCount: number;
  skippedCount: number;
  cacheInvalidated: boolean;
};
