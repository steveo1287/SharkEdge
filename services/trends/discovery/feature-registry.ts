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
    field: "weatherBucket",
    group: "weather",
    type: "categorical",
    allowedValues: ["indoor", "outdoor", "wind", "rain", "cold", "heat", "humidity", "unknown"]
  },
  {
    field: "windBucket",
    group: "weather",
    type: "categorical",
    allowedValues: ["calm", "moderate", "windy", "extreme", "unknown"]
  },
  {
    field: "weatherExposure",
    group: "venue_weather",
    type: "categorical",
    allowedValues: ["INDOOR", "OUTDOOR", "MIXED", "UNKNOWN"]
  },
  {
    field: "roofType",
    group: "venue_weather",
    type: "categorical",
    allowedValues: ["OPEN_AIR", "RETRACTABLE", "FIXED_DOME", "UNKNOWN"]
  },
  {
    field: "playerName",
    group: "player",
    type: "categorical"
  },
  {
    field: "opponentPlayerName",
    group: "player_vs_player",
    type: "categorical"
  }
];
