export type MlbTrendFamily =
  | "TOTALS"
  | "MONEYLINE"
  | "RUNLINE"
  | "SITUATIONAL";

export type MlbTrendTimeBucket = "day" | "night";
export type MlbTrendWindDirectionBucket = "out" | "in" | "cross" | "calm" | "unknown";
export type MlbTrendRoofState = "open" | "closed" | "retractable" | "unknown";
export type MlbTrendTeamRole = "home" | "away";
export type MlbTrendBullpenState = "fresh" | "neutral" | "taxed" | "unknown";

export type MlbTrendBetSide =
  | "over"
  | "under"
  | "home_ml"
  | "away_ml"
  | "home_runline"
  | "away_runline"
  | "subject_ml"
  | "opponent_ml"
  | "subject_runline"
  | "opponent_runline";

export type MlbTrendSubject =
  | { type: "league" }
  | {
      type: "team";
      teamId?: string | null;
      teamName?: string | null;
    };

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
  | "starting_pitcher_hand_away"
  | "home_team_id"
  | "away_team_id"
  | "park_id"
  | "park_name"
  | "is_division_game"
  | "game_time_bucket"
  | "roof_state"
  | "temperature_f"
  | "wind_mph"
  | "wind_direction_bucket"
  | "favorite_team_role"
  | "favorite_moneyline"
  | "underdog_moneyline"
  | "home_is_favorite"
  | "away_is_favorite"
  | "home_prev_game_time_bucket"
  | "away_prev_game_time_bucket"
  | "home_night_to_day_turnaround"
  | "away_night_to_day_turnaround"
  | "home_days_rest"
  | "away_days_rest"
  | "home_bullpen_state"
  | "away_bullpen_state"
  | "subject_team_id"
  | "opponent_team_id"
  | "subject_is_home"
  | "subject_is_away"
  | "subject_moneyline"
  | "opponent_moneyline"
  | "subject_runline"
  | "opponent_runline"
  | "subject_is_favorite"
  | "subject_is_underdog"
  | "subject_prev_game_time_bucket"
  | "subject_night_to_day_turnaround"
  | "subject_days_rest"
  | "subject_bullpen_state"
  | "subject_starting_pitcher_hand"
  | "opponent_starting_pitcher_hand";

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
  subject?: MlbTrendSubject;
  betSide: MlbTrendBetSide;
  conditions: MlbTrendCondition[];
  conditionLabels?: string[];
  whyThisMatters: string;
  cautionNote: string;
  lookbackSeasons?: number;
  minimumSampleSize?: number;
  enabled: boolean;
};

export type MlbTrendResult = "win" | "loss" | "push" | "skip";

export type MlbTrendRiskLabel = "LOW" | "MEDIUM" | "HIGH";

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
  record: string;
  confidenceLabel: "LOW" | "MEDIUM" | "HIGH";
  stabilityLabel: "VOLATILE" | "STEADY" | "STRONG";
  signalScore?: number;
  stabilityScore?: number;
  fragilityScore?: number;
  overfitRisk?: number;
  seasonConcentration?: number;
  neighborBandScore?: number;
  neighborBandCount?: number;
  holdoutScore?: number;
  holdoutSeasons?: number;
  holdoutPassRate?: number;
  warnings: string[];
  units?: number;
  pricedRows?: number;
  roiCoverage?: number;
  last10?: string;
  streak?: string | null;
  yearsCovered?: number;
  seasons?: number[];
  history?: MlbTrendHistoryRow[];
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
  subject?: MlbTrendSubject;
  betSide: MlbTrendBetSide;
  whyThisMatters: string;
  cautionNote: string;

  wins: number;
  losses: number;
  pushes: number;
  sampleSize: number;
  record: string;
  hitRate: number | null;
  roi: number | null;

  confidenceLabel: "LOW" | "MEDIUM" | "HIGH";
  stabilityLabel: "VOLATILE" | "STEADY" | "STRONG";
  signalScore?: number;
  stabilityScore?: number;
  fragilityScore?: number;
  overfitRisk?: number;
  seasonConcentration?: number;
  neighborBandScore?: number;
  neighborBandCount?: number;
  holdoutScore?: number;
  holdoutSeasons?: number;
  holdoutPassRate?: number;
  warnings: string[];

  todayMatches: MlbTrendMatch[];

  conditions?: string[];
  conditionCount?: number;
  units?: number;
  pricedRows?: number;
  roiCoverage?: number;
  last10?: string;
  streak?: string | null;
  yearsCovered?: number;
  seasons?: number[];
  history?: MlbTrendHistoryRow[];
};

export type PublishedMlbTrendFeed = {
  generatedAt: string;
  cards: PublishedMlbTrendCard[];
  warnings: string[];
};
