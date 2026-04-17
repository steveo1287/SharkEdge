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
    field: "projectionDelta",
    group: "projection_edge",
    type: "bucketed_numeric",
    buckets: [-2, -1, -0.5, 0, 0.5, 1, 2]
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
  },
  {
    field: "playerName",
    group: "player",
    type: "categorical"
  },
  {
    field: "marketType",
    group: "market_type",
    type: "categorical"
  }
];
