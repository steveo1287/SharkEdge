export type TrendOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "between"
  | "contains";

export type TrendField =
  | "league"
  | "season"
  | "sportsbook"
  | "marketType"
  | "favoriteUnderdog"
  | "homeAway"
  | "line"
  | "total"
  | "teamRankBucket"
  | "opponentRankBucket"
  | "efficiencyBucket"
  | "paceBucket"
  | "epaBucket"
  | "xgBucket"
  | "restDifferential"
  | "travelDistance"
  | "altitude"
  | "weatherBucket"
  | "injuryStatus"
  | "streak"
  | "lineMovementDirection"
  | "openingCurrentDelta"
  | "usageTrend";

export type TrendFilter = {
  field: TrendField;
  operator: TrendOperator;
  value: string | number | boolean | Array<string | number>;
};

export type ValidationBadge = "descriptive" | "candidate" | "validated" | "fragile";

export type TrendDefinition = {
  id: string;
  name: string;
  description: string;
  filters: TrendFilter[];
  minimumSample: number;
  createdAt: string;
};

export type TrendPerformance = {
  sampleSize: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  roiPct: number;
  units: number;
  averageOdds: number | null;
  averageClvPct: number | null;
  maxDrawdown: number | null;
  longestWinStreak: number;
  longestLossStreak: number;
};

export type TrendValidation = {
  badge: ValidationBadge;
  warnings: string[];
  inSample: TrendPerformance;
  outOfSample: TrendPerformance | null;
  recentWindow: TrendPerformance | null;
};

export type TrendMatchExplanation = {
  trendId: string;
  eventId: string;
  matchedFilters: TrendFilter[];
  whyItMatches: string[];
  validation: TrendValidation;
};
