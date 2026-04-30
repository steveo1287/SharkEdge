export type NbaDataSourceKey =
  | "bigdataball"
  | "licensed_odds"
  | "nba_stats"
  | "nba_api"
  | "cleaning_the_glass"
  | "dunks_and_threes"
  | "pbp_stats"
  | "basketball_reference"
  | "stathead"
  | "internal"
  | "manual"
  | "unknown";

export type NbaLicenseRisk = "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
export type NbaSourceConfidence = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";
export type NbaDataFreshnessState = "FRESH" | "AGING" | "STALE" | "MISSING";

export type NbaSourceAttribution = {
  sourceKey: NbaDataSourceKey;
  sourceLabel: string;
  fetchedAt: string | null;
  updatedAt: string | null;
  confidence: NbaSourceConfidence;
  licenseRisk: NbaLicenseRisk;
  notes: string[];
};

export type NbaSourceHealthReport = {
  sourceKey: NbaDataSourceKey;
  label: string;
  configured: boolean;
  freshnessState: NbaDataFreshnessState;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  consecutiveFailures: number;
  confidence: NbaSourceConfidence;
  licenseRisk: NbaLicenseRisk;
  warnings: string[];
};

export type NbaTeamAdvancedProfile = {
  teamId: string;
  teamName?: string | null;
  offensiveRating: number | null;
  defensiveRating: number | null;
  netRating: number | null;
  pace: number | null;
  effectiveFieldGoalPct: number | null;
  turnoverPct: number | null;
  offensiveReboundPct: number | null;
  freeThrowRate: number | null;
  rollingNetRatingLast5: number | null;
  rollingNetRatingLast10: number | null;
  source: NbaSourceAttribution;
};

export type NbaPlayerGameProfile = {
  playerId: string;
  teamId: string;
  gamesIncluded: number;
  averageMinutes: number | null;
  usageRate: number | null;
  pointsPerGame: number | null;
  reboundsPerGame: number | null;
  assistsPerGame: number | null;
  threesPerGame: number | null;
  source: NbaSourceAttribution;
};

export type NbaAvailabilityStatus =
  | "AVAILABLE"
  | "PROBABLE"
  | "QUESTIONABLE"
  | "DOUBTFUL"
  | "OUT"
  | "UNKNOWN";

export type NbaPlayerAvailability = {
  playerId: string;
  teamId: string;
  gameId: string | null;
  status: NbaAvailabilityStatus;
  expectedMinutes: number | null;
  baselineMinutes: number | null;
  minutesUncertainty: number | null;
  source: NbaSourceAttribution;
};

export type NbaPlayerImpactRating = {
  playerId: string;
  season: string;
  offensiveImpactPer100: number | null;
  defensiveImpactPer100: number | null;
  totalImpactPer100: number | null;
  source: NbaSourceAttribution;
};

export const HIGH_RISK_NBA_PRODUCTION_SOURCES: NbaDataSourceKey[] = [
  "nba_stats",
  "nba_api",
  "basketball_reference",
  "stathead",
  "cleaning_the_glass",
  "dunks_and_threes",
  "pbp_stats"
];

export function createInternalNbaSource(label = "SharkEdge internal"): NbaSourceAttribution {
  return {
    sourceKey: "internal",
    sourceLabel: label,
    fetchedAt: null,
    updatedAt: null,
    confidence: "UNKNOWN",
    licenseRisk: "LOW",
    notes: []
  };
}
