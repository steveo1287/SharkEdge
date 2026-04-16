export type MlbUncertaintyBand = {
  low: number;
  median: number;
  high: number;
};

export type MlbSelectiveQualification = {
  qualifies: boolean;
  reason: string;
  confidenceTier: "elite" | "strong" | "watchlist" | "pass";
};

export type MlbIntelligenceEnvelope = {
  eventId: string;
  winProbabilityBand: MlbUncertaintyBand;
  runTotalBand: MlbUncertaintyBand;
  explanationStability: number;
  uncertaintyPenalty: number;
  selectiveQualification: MlbSelectiveQualification;
};
