export type MlbTrendMarketType = "moneyline" | "runline" | "total";

export type MlbTrendHistoricalRow = {
  gameId: string;
  externalGameId?: string | null;

  gameDate: string;
  season: number;

  league: "MLB";

  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;

  homeScore: number;
  awayScore: number;
  totalRuns: number;
  homeWon: boolean;
  awayWon: boolean;

  closingMoneylineHome?: number | null;
  closingMoneylineAway?: number | null;

  closingRunlineHome?: number | null;
  closingRunlineAway?: number | null;
  closingRunlinePriceHome?: number | null;
  closingRunlinePriceAway?: number | null;

  closingTotal?: number | null;
  closingTotalOverPrice?: number | null;
  closingTotalUnderPrice?: number | null;

  startingPitcherHome?: string | null;
  startingPitcherAway?: string | null;
  startingPitcherHandHome?: "L" | "R" | null;
  startingPitcherHandAway?: "L" | "R" | null;

  bullpenStatusHome?: string | null;
  bullpenStatusAway?: string | null;

  isDoubleHeader?: boolean | null;
  gameNumberInSeries?: number | null;

  weatherSummary?: string | null;
  temperatureF?: number | null;
  windMph?: number | null;
  windDirection?: string | null;

  source?: string | null;
};

export type MlbTrendBoardRow = {
  gameId: string;
  externalGameId?: string | null;

  startsAt?: string | null;
  league: "MLB";

  homeTeamId: string;
  awayTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  matchup: string;

  currentMoneylineHome?: number | null;
  currentMoneylineAway?: number | null;

  currentRunlineHome?: number | null;
  currentRunlineAway?: number | null;
  currentRunlinePriceHome?: number | null;
  currentRunlinePriceAway?: number | null;

  currentTotal?: number | null;
  currentTotalOverPrice?: number | null;
  currentTotalUnderPrice?: number | null;

  startingPitcherHome?: string | null;
  startingPitcherAway?: string | null;
  startingPitcherHandHome?: "L" | "R" | null;
  startingPitcherHandAway?: "L" | "R" | null;

  status?: string | null;
  source?: string | null;
};

export type MlbHistoricalNormalizationResult = {
  rows: MlbTrendHistoricalRow[];
  warnings: string[];
};

export type MlbBoardNormalizationResult = {
  rows: MlbTrendBoardRow[];
  warnings: string[];
};
