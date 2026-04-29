export type MlbTrendFamily =
  | "TOTALS"
  | "MONEYLINE"
  | "RUNLINE"
  | "SITUATIONAL";

export type MlbTrendBetSide =
  | "over"
  | "under"
  | "home_ml"
  | "away_ml"
  | "home_runline"
  | "away_runline";

export type MlbTrendConditionField =
  | "closing_total"
  | "closing_moneyline_home"
  | "closing_moneyline_away"
  | "closing_runline_home"
  | "closing_runline_away"
  | "home_win"
  | "away_win"
  | "total_runs"
  | "season"
  | "month"
  | "is_doubleheader"
  | "game_number_in_series"
  | "starting_pitcher_hand_home"
  | "starting_pitcher_hand_away";

export type MlbTrendOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

export type MlbTrendCondition = {
  field: MlbTrendConditionField;
  op: MlbTrendOperator;
  value?: string | number | boolean;
  min?: number;
  max?: number;
};

export type MlbTrendDefinition = {
  id: string;
  family: MlbTrendFamily;
  title: string;
  description: string;
  betSide: MlbTrendBetSide;
  conditions: MlbTrendCondition[];
  conditionLabels?: string[];
  whyThisMatters: string;
  cautionNote: string;
  enabled: boolean;
};

export type MlbTrendResult = "win" | "loss" | "push" | "skip";

export type MlbTrendHistoryRow = {
  gameId: string;
  gameDate: string;
  season: number;
  matchup: string;
  recommendedBet: string;
  result: Exclude<MlbTrendResult, "skip">;
  price: number | null;
  profitUnits: number;
  awayTeamName: string;
  homeTeamName: string;
  awayScore: number;
  homeScore: number;
  closingTotal: number | null;
};

export type MlbTrendEvaluationSummary = {
  trendId: string;
  wins: number;
  losses: number;
  pushes: number;
  skips: number;
  sampleSize: number;
  hitRate: number | null;
  roi: number | null;
  units: number;
  pricedRows: number;
  roiCoverage: number;
  record: string;
  last10: string;
  streak: string | null;
  yearsCovered: number;
  seasons: number[];
  history: MlbTrendHistoryRow[];
  confidenceLabel: "LOW" | "MEDIUM" | "HIGH";
  stabilityLabel: "VOLATILE" | "STEADY" | "STRONG";
  warnings: string[];
};

export type MlbTrendMatch = {
  trendId: string;
  gameId: string;
  matchup: string;
  startsAt?: string | null;
  recommendedBet: string;
  explanation: string;
  marketType: "moneyline" | "runline" | "total";
};

export type PublishedMlbTrendCard = {
  id: string;
  family: MlbTrendFamily;
  title: string;
  description: string;
  betSide: MlbTrendBetSide;
  whyThisMatters: string;
  cautionNote: string;
  conditions: string[];
  conditionCount: number;

  wins: number;
  losses: number;
  pushes: number;
  sampleSize: number;
  record: string;
  hitRate: number | null;
  roi: number | null;
  units: number;
  pricedRows: number;
  roiCoverage: number;
  last10: string;
  streak: string | null;
  yearsCovered: number;
  seasons: number[];
  history: MlbTrendHistoryRow[];

  confidenceLabel: "LOW" | "MEDIUM" | "HIGH";
  stabilityLabel: "VOLATILE" | "STEADY" | "STRONG";
  warnings: string[];

  todayMatches: MlbTrendMatch[];
};

export type PublishedMlbTrendFeed = {
  generatedAt: string;
  cards: PublishedMlbTrendCard[];
  warnings: string[];
};
