export type SimulationContribution = {
  key: string;
  label: string;
  value: number;
  confidence: number;
  source: string;
  detail: string;
};

export type SimulationScenarioSpec = {
  id: string;
  label: string;
  weatherShift?: number;
  paceShift?: number;
  injuryUsageShift?: number;
  fatigueShift?: number;
  officiatingShift?: number;
};

export type SimulationScenarioResult = {
  scenario: SimulationScenarioSpec;
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedSpreadHome: number;
  winProbHome: number;
};

export type SimulationDecomposition = {
  baseRatingEdge: number;
  marketAnchorEffect: number;
  weatherEffect: number;
  travelEffect: number;
  styleEffect: number;
  playerAvailabilityEffect: number;
  residualModelEffect: number;
  uncertaintyPenalty: number;
  totalAdjustedEdge: number;
  confidence: number;
  contributions: SimulationContribution[];
  scenarios: SimulationScenarioResult[];
};
