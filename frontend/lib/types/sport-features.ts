export type SportFeatureCategory =
  | "efficiency"
  | "expected_value"
  | "matchup"
  | "tempo"
  | "regression"
  | "environment"
  | "player_impact"
  | "volatility";

export type SportFeatureDefinition = {
  key: string;
  label: string;
  category: SportFeatureCategory;
  description: string;
  weight: number;
  sourceHint: string;
};

export type SportFeatureValue = {
  key: string;
  value: number;
  source: string;
  confidence: number;
  detail: string;
};

export type AdvancedStatDriver = {
  key: string;
  label: string;
  category: SportFeatureCategory;
  score: number;
  source: string;
  detail: string;
};

export type AdvancedStatContext = {
  sport: string;
  eventId: string;
  generatedAt: string;
  features: SportFeatureValue[];
  topDrivers: AdvancedStatDriver[];
  summary: string;
};
