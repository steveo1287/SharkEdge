// Core product types shared across Home, SimHub, SharkTrends, SharkFights, Accuracy, Saved.
// Use these instead of scattered local definitions.

export type SportKey = "mlb" | "nba" | "ufc";

export type RiskFlag = {
  code: string;
  label: string;
  severity: "low" | "medium" | "high";
};

export type SimPick = {
  id: string;
  sport: SportKey;
  matchup: string;
  market: string;
  pick: string;
  modelProbability: number;
  impliedProbability?: number;
  edge?: number;
  confidence?: string;
  modelVersion: string;
  simulationCount?: number;
  lastRunAt?: string;
  reasons: string[];
  riskFlags: RiskFlag[];
};

export type TrendCard = {
  id: string;
  sport: SportKey;
  title: string;
  subject: string;
  sampleSize?: number;
  dateRange?: string;
  hitRate?: number;
  context?: string;
  modelAgrees?: boolean;
  marketPricedIn?: boolean;
  riskFlags: RiskFlag[];
};

export type AccuracySummary = {
  sport: SportKey | "all";
  market?: string;
  modelVersion?: string;
  settledPicks: number;
  wins?: number;
  losses?: number;
  pushes?: number;
  winRate?: number;
  roi?: number;
  brierScore?: number;
  clv?: number;
};

export type SavedPlay = {
  id: string;
  sport: SportKey;
  matchup: string;
  market: string;
  pick: string;
  savedAt: string;
  odds?: number;
  result?: "win" | "loss" | "push" | "pending";
  notes?: string;
};
