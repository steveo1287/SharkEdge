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
    id: "mlb-returning-home",
    title: "Returning-home moneyline spots",
    description: "Teams coming back home after a road game, checked against price and result history.",
    filters: { league: "MLB", marketType: "moneyline", travelSpot: "road_to_home", homeAway: "HOME", minDataQualityScore: 65 },
    category: "Schedule",
    requiresFields: ["home/away sequence", "pregame moneyline", "official result"]
  },
  {
    id: "mlb-homestand-favorites",
    title: "Homestand favorites",
    description: "Home favorites that stayed at home from the previous game.",
    filters: { league: "MLB", marketType: "moneyline", side: "FAVORITE", homeAway: "HOME", travelSpot: "home_stand", favoriteMinAbsPrice: 120, favoriteMaxAbsPrice: 190, minDataQualityScore: 65 },
    category: "Schedule + Price",
    requiresFields: ["home/away sequence", "pregame moneyline", "official result"]
  },
  {
    id: "mlb-road-dogs-after-low-offense",
    title: "Road dogs after dead bats",
    description: "Road underdogs after scoring 2 or fewer in the previous game.",
    filters: { league: "MLB", marketType: "moneyline", side: "UNDERDOG", homeAway: "AWAY", previousRunsScoredMax: 2, oddsMin: 100, oddsMax: 220, minDataQualityScore: 65 },
    category: "Form + Price",
    requiresFields: ["previous game runs", "pregame moneyline", "official result"]
  },
  {
    id: "mlb-cold-offense-unders",
    title: "Cold-offense unders",
    description: "Unders when the team has scored 5 or fewer total runs across its previous two games.",
    filters: { league: "MLB", marketType: "total", side: "UNDER", lastTwoRunsScoredMax: 5, totalMax: 8.5, minDataQualityScore: 65 },
    category: "Totals + Form",
    requiresFields: ["previous two game runs", "total line", "official result"]
  },
  {
    id: "mlb-after-allowing-eight",
    title: "Teams after allowing 8+",
    description: "Moneyline response after a team allowed eight or more runs in its last game.",
    filters: { league: "MLB", marketType: "moneyline", previousRunsAllowedMin: 8, minDataQualityScore: 65 },
    category: "Form",
    requiresFields: ["previous game runs allowed", "pregame moneyline", "official result"]
  },
  {
    id: "mlb-day-game-low-total-under",
    title: "Day-game low-total unders",
    description: "Unders in day games when the closing total is 8.5 or lower.",
    filters: { league: "MLB", marketType: "total", side: "UNDER", dayGame: true, totalMax: 8.5, minDataQualityScore: 65 },
    category: "Totals + Timing",
    requiresFields: ["day/night flag", "total line", "official result"]
  },
  {
    id: "mlb-night-game-favorites",
    title: "Night-game favorites",
    description: "Favorites in night games, with source and sportsbook split proof.",
    filters: { league: "MLB", marketType: "moneyline", side: "FAVORITE", nightGame: true, favoriteMinAbsPrice: 120, favoriteMaxAbsPrice: 180, minDataQualityScore: 65 },
    category: "Timing + Price",
    requiresFields: ["day/night flag", "pregame moneyline", "official result"]
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
    id: "mlb-cold-starter-fade",
    title: "Cold starter fade zone",
    description: "Moneyline spots where the listed starter has a weak rolling game score.",
    filters: { league: "MLB", marketType: "moneyline", starterRollingGameScoreMax: 45, minDataQualityScore: 70 },
    category: "Pitching",
    requiresFields: ["starter rolling game score", "pregame moneyline", "official result"],
    warning: "This is only active when Retrosheet pitching snapshots are populated."
  },
  {
    id: "mlb-elo-edge-favorites",
    title: "Elo-edge favorites",
    description: "Favorites with a meaningful Retrosheet-derived pregame Elo edge.",
    filters: { league: "MLB", marketType: "moneyline", side: "FAVORITE", eloDiffMin: 25, favoriteMaxAbsPrice: 190, minDataQualityScore: 70 },
    category: "Team Strength",
    requiresFields: ["MLB Elo snapshot", "pregame moneyline", "official result"],
    warning: "Only qualifies games with real stored Elo context."
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
