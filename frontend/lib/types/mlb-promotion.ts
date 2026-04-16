export type MlbPromotionDecision = {
  finalPromotionScore: number;
  tier: "elite" | "strong" | "watchlist" | "pass";
  isSuppressed: boolean;
  marketDisagreement: number;
  explanationConsistency: number;
  certaintyScore: number;
  rationale: string[];
};
