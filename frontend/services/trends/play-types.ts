export type ActivationState =
  | "LIVE_NOW"
  | "BUILDING"
  | "EARLY"
  | "DEAD"
  | "PASS";

export type RankedTrendPlay = {
  systemId: string;
  eventId: string;
  gameLabel: string;
  league: string;

  marketType: "moneyline" | "spread" | "total";
  selection: string;

  sportsbook: string | null;
  line: number | null;
  oddsAmerican: number | null;

  marketImpliedProb: number | null;
  fairImpliedProb: number | null;
  rawModelProb: number | null;
  calibratedModelProb: number | null;
  probabilityLowerBound: number | null;
  probabilityUpperBound: number | null;

  fairLine: number | null;
  fairOddsAmerican: number | null;
  edgePct: number | null;

  sampleSize: number;
  roiPct: number | null;
  clvPct: number | null;
  brierScore: number | null;
  calibrationError: number | null;

  calibrationScore: number;
  stabilityScore: number;
  confidenceScore: number;
  timingScore: number;
  marketScore: number;
  dataQualityScore: number;
  finalScore: number;

  activationState: ActivationState;
  tier: "A" | "B" | "C" | "PASS";

  reasons: string[];
  warnings: string[];
};

export type TrendsDiagnostics = {
  historicalRows: number;
  currentRows: number;
  discoveredSystems: number;
  validatedSystems: number;
  activeCandidates: number;
  surfacedPlays: number;
  providerStatus: "ok" | "degraded" | "down";
  issues: string[];
};

export type TrendsPlaysResponse = {
  generatedAt: string;
  diagnostics: TrendsDiagnostics;
  bestPlays: RankedTrendPlay[];
  buildingSignals: RankedTrendPlay[];
  historicalSystems: RankedTrendPlay[];
};

