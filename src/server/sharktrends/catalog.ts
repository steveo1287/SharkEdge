import type { SharkTrendFilter } from "./types";

export type SharkTrendTemplate = {
  id: string;
  title: string;
  description: string;
  filters: SharkTrendFilter;
  category: string;
  requiresFields: string[];
  warning?: string;
};

export const SHARKTREND_TEMPLATES: SharkTrendTemplate[] = [
  {
    id: "mlb-home-favorites-bucket",
    title: "Home favorites by moneyline bucket",
    description: "MLB home favorites in a controlled price range.",
    filters: { league: "MLB", marketType: "moneyline", side: "FAVORITE", homeAway: "HOME", favoriteMinAbsPrice: 140, favoriteMaxAbsPrice: 180, minDataQualityScore: 60 },
    category: "Price Buckets",
    requiresFields: ["pregame moneyline", "official result"]
  },
  {
    id: "mlb-road-underdogs",
    title: "Road underdogs by price",
    description: "Road teams catching plus money, grouped by historical source and season.",
    filters: { league: "MLB", marketType: "moneyline", side: "UNDERDOG", homeAway: "AWAY", oddsMin: 100, oddsMax: 180, minDataQualityScore: 60 },
    category: "Price Buckets",
    requiresFields: ["pregame moneyline", "official result"]
  },
  {
    id: "mlb-division-unders",
    title: "Division game unders",
    description: "Unders in division matchups when the total is not inflated.",
    filters: { league: "MLB", marketType: "total", side: "UNDER", divisionGame: true, totalMax: 8.5, minDataQualityScore: 65 },
    category: "Totals",
    requiresFields: ["total line", "official result", "division flag"],
    warning: "Requires division metadata in the MLB context table."
  },
  {
    id: "mlb-wrigley-wind-out-overs",
    title: "Wrigley wind-out overs",
    description: "Overs at Wrigley when wind is blowing out at 10+ mph.",
    filters: { league: "MLB", marketType: "total", side: "OVER", venue: "Wrigley", windOut: true, windMphMin: 10, totalMax: 9, minDataQualityScore: 70 },
    category: "Weather",
    requiresFields: ["venue", "wind direction", "wind speed", "total line"],
    warning: "Only returns results where weather fields are present."
  },
  {
    id: "mlb-low-offense-bounce",
    title: "Teams after scoring 2 or fewer",
    description: "Teams after a quiet offensive game.",
    filters: { league: "MLB", marketType: "moneyline", previousRunsScoredMax: 2, minDataQualityScore: 65 },
    category: "Form",
    requiresFields: ["previous game runs", "pregame moneyline", "official result"]
  },
  {
    id: "mlb-short-rest",
    title: "Short rest teams",
    description: "Teams on zero or one day of rest.",
    filters: { league: "MLB", marketType: "moneyline", daysRestMax: 1, minDataQualityScore: 65 },
    category: "Schedule",
    requiresFields: ["days rest", "pregame moneyline", "official result"],
    warning: "Requires rest/travel context to be built."
  },
  {
    id: "mlb-home-to-road-travel",
    title: "Home-to-road travel spot",
    description: "Teams leaving a homestand for a road game, with historical moneyline grading.",
    filters: { league: "MLB", marketType: "moneyline", travelSpot: "home_to_road", minDataQualityScore: 65 },
    category: "Schedule",
    requiresFields: ["previous game date", "home/away sequence", "pregame moneyline", "official result"]
  },
  {
    id: "mlb-road-trip-fatigue",
    title: "Road trip continuation",
    description: "Teams staying on the road after a previous road game.",
    filters: { league: "MLB", marketType: "moneyline", travelSpot: "road_trip", daysRestMax: 1, minDataQualityScore: 65 },
    category: "Schedule",
    requiresFields: ["previous game date", "home/away sequence", "days rest", "pregame moneyline"]
  },
  {
    id: "mlb-pitcher-form",
    title: "Starting pitcher rolling form",
    description: "Teams backed by starters with strong rolling game score.",
    filters: { league: "MLB", marketType: "moneyline", starterRollingGameScoreMin: 58, minDataQualityScore: 70 },
    category: "Pitching",
    requiresFields: ["starter rolling game score", "pregame moneyline", "official result"]
  },
  {
    id: "mlb-low-total-unders",
    title: "Low total unders",
    description: "Unders when the market already prices a lower run environment.",
    filters: { league: "MLB", marketType: "total", side: "UNDER", totalMax: 8, minDataQualityScore: 60 },
    category: "Totals",
    requiresFields: ["total line", "official result"]
  }
];

export function getSharkTrendCatalog() {
  return { templates: SHARKTREND_TEMPLATES };
}
