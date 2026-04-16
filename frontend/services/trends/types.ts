export type SupportedDiscoveryMarket = "moneyline" | "spread" | "total";
export type SupportedDiscoverySide = "home" | "away" | "over" | "under";
export type ConditionOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between" | "is_true" | "is_false";
export type ConfidenceTier = "A" | "B" | "C";
export type TimingState = "EARLY" | "BUILDING" | "PEAK" | "LATE" | "DEAD";

export type HistoricalBetOpportunity = {
  rowId: string;
  eventId: string;
  gameDate: string;
  season: number;
  sport: string;
  league: string;
  marketType: SupportedDiscoveryMarket;
  side: SupportedDiscoverySide;
  teamName: string | null;
  opponentName: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeAway: "home" | "away" | null;
  favoriteOrDog: "favorite" | "dog" | "pickem" | null;
  line: number | null;
  oddsAmerican: number;
  closeLine: number | null;
  closeOddsAmerican: number | null;
  won: boolean | null;
  push: boolean;
  profitUnits: number | null;
  clvCents: number | null;
  beatClose: boolean | null;
  daysRest: number | null;
  opponentRestDays: number | null;
  isBackToBack: boolean | null;
  recentWinRate: number | null;
  recentMargin: number | null;
  lineBucket: string | null;
  totalBucket: string | null;
  metadata: Record<string, unknown>;
};

export type TrendCondition = {
  field: string;
  operator: ConditionOperator;
  value?: string | number | boolean;
  value2?: number;
  label: string;
  group: string;
};

export type FeatureDefinition = {
  field: keyof HistoricalBetOpportunity | string;
  group: string;
  type: "categorical" | "bucketed_numeric" | "boolean";
  allowedValues?: Array<string | number | boolean>;
  buckets?: number[];
};

export type TrendDiscoveryConfig = {
  minSample: number;
  minRecentSample: number;
  minSeasons: number;
  maxSeedAtoms: number;
  beamWidth: number;
  maxConditions: number;
  maxSystemOverlap: number;
  requirePositiveClv: boolean;
};

export type CandidateTrendSystem = {
  id: string;
  sport: string;
  league: string;
  marketType: SupportedDiscoveryMarket;
  side: SupportedDiscoverySide;
  conditions: TrendCondition[];
  name: string;
  shortLabel: string;
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number | null;
  roi: number | null;
  totalProfit: number | null;
  avgClv: number | null;
  beatCloseRate: number | null;
  seasons: number[];
  recentSampleSize: number;
  score: number;
  validationScore: number;
  tier: ConfidenceTier;
  warnings: string[];
  activationCount?: number;
  triggerEventIds?: string[];
};

export type ActiveTrendSignal = {
  systemId: string;
  eventId: string;
  gameDate: string;
  league: string;
  sport: string;
  marketType: SupportedDiscoveryMarket;
  side: SupportedDiscoverySide;
  systemName: string;
  currentLine: number | null;
  currentOdds: number;
  fairOdds: number | null;
  edgePct: number | null;
  posteriorProbability?: number | null;
  marketProbability?: number | null;
  trendLiftPct?: number | null;
  uncertaintyScore?: number | null;
  reliabilityScore?: number | null;
  supportScore?: number | null;
  timingState: TimingState;
  confidenceTier: ConfidenceTier;
  reasons: string[];
  eventLabel: string;
};
