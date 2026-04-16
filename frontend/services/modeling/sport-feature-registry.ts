import type { SportFeatureDefinition } from "@/lib/types/sport-features";

export const sportFeatureRegistry: Record<string, SportFeatureDefinition[]> = {
  MLB: [
    { key: "woba", label: "wOBA", category: "efficiency", description: "Run-value weighted offensive quality.", weight: 0.95, sourceHint: "Statcast/Fangraphs style batting data" },
    { key: "xwoba", label: "xwOBA", category: "expected_value", description: "Expected weighted on-base quality.", weight: 0.98, sourceHint: "Statcast expected outcome data" },
    { key: "fip", label: "FIP", category: "efficiency", description: "Pitcher outcomes independent of fielding.", weight: 0.9, sourceHint: "Pitching advanced stats" },
    { key: "barrel_rate", label: "Barrel %", category: "matchup", description: "Rate of elite quality contact.", weight: 0.82, sourceHint: "Batted-ball quality data" }
  ],
  NFL: [
    { key: "epa_per_play", label: "EPA/Play", category: "expected_value", description: "Expected points impact per play.", weight: 0.99, sourceHint: "Play-by-play model" },
    { key: "dvoa", label: "DVOA", category: "efficiency", description: "Opponent-adjusted team efficiency.", weight: 0.93, sourceHint: "Opponent-adjusted team model" },
    { key: "pass_block_win_rate", label: "Pass block win rate", category: "matchup", description: "Trench-level pass protection edge.", weight: 0.84, sourceHint: "Tracking/trench charting" },
    { key: "pressure_rate", label: "Pressure rate", category: "volatility", description: "Defense disruption level.", weight: 0.8, sourceHint: "Pressure and sack data" }
  ],
  NBA: [
    { key: "epm", label: "EPM", category: "player_impact", description: "Estimated player impact.", weight: 0.97, sourceHint: "Player impact model" },
    { key: "true_shooting", label: "TS%", category: "efficiency", description: "Scoring efficiency including free throws and threes.", weight: 0.9, sourceHint: "Shot/usage data" },
    { key: "net_rating", label: "Net rating", category: "efficiency", description: "Points per 100 possessions differential.", weight: 0.92, sourceHint: "Possession-normalized team data" },
    { key: "pace", label: "Pace", category: "tempo", description: "Possession volume and tempo pressure.", weight: 0.76, sourceHint: "Possession tracking" }
  ],
  NHL: [
    { key: "xgoals", label: "xGoals", category: "expected_value", description: "Expected goals from shot quality.", weight: 0.98, sourceHint: "Shot danger model" },
    { key: "corsi", label: "Corsi", category: "tempo", description: "Shot-attempt control proxy.", weight: 0.84, sourceHint: "5v5 possession stats" },
    { key: "pdo", label: "PDO", category: "regression", description: "Luck and regression indicator.", weight: 0.74, sourceHint: "Shooting/save percentage blend" },
    { key: "high_danger_share", label: "High-danger share", category: "matchup", description: "Danger-zone chance control.", weight: 0.86, sourceHint: "Shot-location model" }
  ],
  CBB: [
    { key: "adj_off_eff", label: "AdjOE", category: "efficiency", description: "Adjusted offensive efficiency.", weight: 0.97, sourceHint: "Opponent-adjusted possession model" },
    { key: "adj_def_eff", label: "AdjDE", category: "efficiency", description: "Adjusted defensive efficiency.", weight: 0.97, sourceHint: "Opponent-adjusted possession model" },
    { key: "efg", label: "eFG%", category: "efficiency", description: "Effective field-goal percentage.", weight: 0.86, sourceHint: "Shot efficiency data" },
    { key: "turnover_rate", label: "Turnover rate", category: "volatility", description: "Possession waste and pressure response.", weight: 0.83, sourceHint: "Four factors" }
  ],
  UFC: [
    { key: "slpm", label: "SLpM", category: "tempo", description: "Strikes landed per minute.", weight: 0.88, sourceHint: "Fight stats" },
    { key: "strike_accuracy", label: "Strike accuracy", category: "efficiency", description: "Landing efficiency.", weight: 0.86, sourceHint: "Fight stats" },
    { key: "strike_defense", label: "Strike defense", category: "matchup", description: "Hit avoidance skill.", weight: 0.84, sourceHint: "Fight stats" },
    { key: "knockdown_ratio", label: "Knockdown ratio", category: "volatility", description: "Power and damage swing factor.", weight: 0.8, sourceHint: "Fight finish threat data" }
  ]
};

export function getSportFeatureDefinitions(sport: string) {
  return sportFeatureRegistry[sport] ?? [];
}
