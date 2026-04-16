export type DecisionFusion = {
  eventId: string;
  marketType: string;
  simScore: number;
  trendScore: number;
  marketScore: number;
  calibrationScore: number;
  uncertaintyPenalty: number;
  conflictPenalty: number;
  redundancyPenalty: number;
  fusedScore: number;
  fusedTier: "elite" | "strong" | "watchlist" | "pass";
  rationale: string[];
  regimeFit: number;
  incrementalTrendValue: number;
};
