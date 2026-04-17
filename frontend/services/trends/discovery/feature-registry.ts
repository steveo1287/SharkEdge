import type { FeatureDefinition } from "../types";

export const trendFeatureRegistry: FeatureDefinition[] = [
  {
    field: "homeAway",
    group: "location",
    type: "categorical",
    allowedValues: ["home", "away"]
  },
  {
    field: "favoriteOrDog",
    group: "market_context",
    type: "categorical",
    allowedValues: ["favorite", "dog", "pickem"]
  },
  {
    field: "lineBucket",
    group: "price",
    type: "categorical"
  },
  {
    field: "totalBucket",
    group: "total_bucket",
    type: "categorical"
  },
  {
    field: "isBackToBack",
    group: "schedule",
    type: "boolean"
  },
  {
    field: "daysRest",
    group: "rest",
    type: "bucketed_numeric",
    buckets: [0, 1, 2, 3]
  },
  {
    field: "opponentRestDays",
    group: "opp_rest",
    type: "bucketed_numeric",
    buckets: [0, 1, 2, 3]
  },
  {
    field: "recentWinRate",
    group: "form",
    type: "bucketed_numeric",
    buckets: [0.35, 0.45, 0.55, 0.65]
  },
  {
    field: "weatherBucket",
    group: "weather",
    type: "categorical",
    allowedValues: ["indoor", "outdoor_unknown", "neutral_outdoor", "windy", "wet", "cold", "hot"]
  },
  {
    field: "altitudeBucket",
    group: "altitude",
    type: "categorical",
    allowedValues: ["sea_level", "elevated", "high_altitude"]
  },
  {
    field: "fighterQualityBucket",
    group: "combat_quality",
    type: "categorical",
    allowedValues: ["elite", "strong", "solid", "volatile"]
  },
  {
    field: "finishPressureBucket",
    group: "combat_finish",
    type: "categorical",
    allowedValues: ["high_finish", "balanced", "decision_heavy"]
  },
  {
    field: "durabilityEdgeBucket",
    group: "combat_durability",
    type: "categorical",
    allowedValues: ["fighter_durable_edge", "opponent_durable_edge", "durability_neutral"]
  },
  {
    field: "styleConflictBucket",
    group: "combat_style",
    type: "categorical",
    allowedValues: ["style_clash", "style_neutral"]
  },
  {
    field: "teamName",
    group: "team",
    type: "categorical"
  },
  {
    field: "opponentName",
    group: "opponent",
    type: "categorical"
  }
];
