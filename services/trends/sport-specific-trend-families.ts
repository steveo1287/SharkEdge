import type { TrendFactoryLeague, TrendFactoryMarket, TrendFactorySide, TrendFilterCondition } from "./trend-candidate-types";

export type SportSpecificTrendFamily = {
  league: TrendFactoryLeague;
  family: string;
  key: string;
  label: string;
  value: string;
  markets?: TrendFactoryMarket[];
  sides?: TrendFactorySide[];
  sourceNeed: string;
};

const FAMILIES: SportSpecificTrendFamily[] = [
  { league: "MLB", family: "sport_specific", key: "mlb_starter_handedness", label: "Starter handedness edge", value: "mlb_starter_handedness", sourceNeed: "probable starter handedness" },
  { league: "MLB", family: "sport_specific", key: "mlb_bullpen_rest_edge", label: "Bullpen rest edge", value: "mlb_bullpen_rest_edge", sourceNeed: "bullpen usage and rest" },
  { league: "MLB", family: "sport_specific", key: "mlb_getaway_day", label: "Getaway day spot", value: "mlb_getaway_day", sourceNeed: "series and travel metadata" },
  { league: "MLB", family: "sport_specific", key: "mlb_day_game", label: "Day-game spot", value: "mlb_day_game", sourceNeed: "start-time metadata" },
  { league: "MLB", family: "sport_specific", key: "mlb_division_game", label: "Division game", value: "mlb_division_game", sourceNeed: "division metadata" },

  { league: "NBA", family: "sport_specific", key: "nba_rest_advantage", label: "Rest advantage", value: "nba_rest_advantage", sourceNeed: "team rest days" },
  { league: "NBA", family: "sport_specific", key: "nba_schedule_density", label: "Dense schedule spot", value: "nba_schedule_density", sourceNeed: "schedule density" },
  { league: "NBA", family: "sport_specific", key: "nba_injury_impact_edge", label: "Injury impact edge", value: "nba_injury_impact_edge", sourceNeed: "injury impact model" },
  { league: "NBA", family: "sport_specific", key: "nba_pace_up", label: "Pace-up spot", value: "nba_pace_up", markets: ["total", "player_prop"], sides: ["over", "player_over"], sourceNeed: "pace ratings" },
  { league: "NBA", family: "sport_specific", key: "nba_pace_down", label: "Pace-down spot", value: "nba_pace_down", markets: ["total", "player_prop"], sides: ["under", "player_under"], sourceNeed: "pace ratings" },
  { league: "NBA", family: "sport_specific", key: "nba_defense_matchup_edge", label: "Defense matchup edge", value: "nba_defense_matchup_edge", sourceNeed: "defensive ratings" },

  { league: "NHL", family: "sport_specific", key: "nhl_goalie_confirmed", label: "Goalie confirmed", value: "nhl_goalie_confirmed", sourceNeed: "confirmed goalie" },
  { league: "NHL", family: "sport_specific", key: "nhl_goalie_rest_edge", label: "Goalie rest edge", value: "nhl_goalie_rest_edge", sourceNeed: "goalie starts and rest" },
  { league: "NHL", family: "sport_specific", key: "nhl_opponent_backup_goalie", label: "Opponent backup goalie", value: "nhl_opponent_backup_goalie", sourceNeed: "projected goalie" },
  { league: "NHL", family: "sport_specific", key: "nhl_schedule_density", label: "Dense schedule spot", value: "nhl_schedule_density", sourceNeed: "schedule density" },
  { league: "NHL", family: "sport_specific", key: "nhl_total_range", label: "Total range", value: "nhl_total_range", markets: ["total"], sourceNeed: "total line" },

  { league: "NFL", family: "sport_specific", key: "nfl_extra_rest", label: "Extra rest", value: "nfl_extra_rest", sourceNeed: "team rest days" },
  { league: "NFL", family: "sport_specific", key: "nfl_travel_spot", label: "Travel spot", value: "nfl_travel_spot", sourceNeed: "travel metadata" },
  { league: "NFL", family: "sport_specific", key: "nfl_weather_total_edge", label: "Weather total edge", value: "nfl_weather_total_edge", markets: ["total"], sourceNeed: "weather feed" },
  { league: "NFL", family: "sport_specific", key: "nfl_key_number_3", label: "Key number 3", value: "nfl_key_number_3", markets: ["spread"], sourceNeed: "spread line" },
  { league: "NFL", family: "sport_specific", key: "nfl_key_number_7", label: "Key number 7", value: "nfl_key_number_7", markets: ["spread"], sourceNeed: "spread line" },

  { league: "NCAAF", family: "sport_specific", key: "ncaaf_altitude_travel", label: "Altitude travel spot", value: "ncaaf_altitude_travel", sourceNeed: "venue altitude" },
  { league: "NCAAF", family: "sport_specific", key: "ncaaf_offense_edge", label: "Offense edge", value: "ncaaf_offense_edge", sourceNeed: "team efficiency ratings" },
  { league: "NCAAF", family: "sport_specific", key: "ncaaf_run_defense_edge", label: "Run defense edge", value: "ncaaf_run_defense_edge", sourceNeed: "defensive efficiency" },
  { league: "NCAAF", family: "sport_specific", key: "ncaaf_lookahead_spot", label: "Lookahead spot", value: "ncaaf_lookahead_spot", sourceNeed: "schedule metadata" },

  { league: "UFC", family: "sport_specific", key: "ufc_reach_edge", label: "Reach edge", value: "ufc_reach_edge", markets: ["fight_winner"], sourceNeed: "athlete measurables" },
  { league: "UFC", family: "sport_specific", key: "ufc_age_edge", label: "Age edge", value: "ufc_age_edge", markets: ["fight_winner"], sourceNeed: "athlete age" },
  { league: "UFC", family: "sport_specific", key: "ufc_grappling_edge", label: "Grappling edge", value: "ufc_grappling_edge", markets: ["fight_winner"], sourceNeed: "athlete metrics" },

  { league: "BOXING", family: "sport_specific", key: "boxing_reach_edge", label: "Reach edge", value: "boxing_reach_edge", markets: ["fight_winner"], sourceNeed: "athlete measurables" },
  { league: "BOXING", family: "sport_specific", key: "boxing_age_edge", label: "Age edge", value: "boxing_age_edge", markets: ["fight_winner"], sourceNeed: "athlete age" },
  { league: "BOXING", family: "sport_specific", key: "boxing_record_quality_edge", label: "Record quality edge", value: "boxing_record_quality_edge", markets: ["fight_winner"], sourceNeed: "record quality model" }
];

export function sportSpecificConditions(league: TrendFactoryLeague, market: TrendFactoryMarket, side: TrendFactorySide): TrendFilterCondition[] {
  return FAMILIES
    .filter((item) => item.league === league)
    .filter((item) => !item.markets || item.markets.includes(market))
    .filter((item) => !item.sides || item.sides.includes(side))
    .map((item) => ({ family: item.family, key: item.key, label: item.label, value: item.value, operator: "derived" }));
}

export function sportSpecificFamilySummary() {
  return FAMILIES.reduce<Array<{ league: TrendFactoryLeague; conditions: number; sourceNeeds: string[] }>>((acc, item) => {
    const existing = acc.find((row) => row.league === item.league);
    if (existing) {
      existing.conditions += 1;
      if (!existing.sourceNeeds.includes(item.sourceNeed)) existing.sourceNeeds.push(item.sourceNeed);
      return acc;
    }
    acc.push({ league: item.league, conditions: 1, sourceNeeds: [item.sourceNeed] });
    return acc;
  }, []).sort((left, right) => left.league.localeCompare(right.league));
}

export function sportSpecificOptions() {
  return FAMILIES.map((item) => ({ key: item.key, label: item.label, league: item.league }));
}
