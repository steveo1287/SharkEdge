import type { MlbStatcastPitchRow } from "@/services/simulation/mlb-statcast-micro-feed-builder";

function value(row: MlbStatcastPitchRow, key: string) {
  const raw = row[key];
  return raw == null ? "" : String(raw).trim();
}

function topBottom(row: MlbStatcastPitchRow) {
  const raw = value(row, "inning_topbot").toLowerCase();
  if (raw.startsWith("top")) return "Top";
  if (raw.startsWith("bot")) return "Bot";
  return "";
}

export function normalizeMlbStatcastRowsForMicroFeed(rows: MlbStatcastPitchRow[]): MlbStatcastPitchRow[] {
  return rows.map((row) => {
    const homeTeam = value(row, "home_team");
    const awayTeam = value(row, "away_team");
    const inningHalf = topBottom(row);
    const inferredBatTeam = inningHalf === "Top" ? awayTeam : inningHalf === "Bot" ? homeTeam : "";
    const inferredFldTeam = inningHalf === "Top" ? homeTeam : inningHalf === "Bot" ? awayTeam : "";
    return {
      ...row,
      bat_team: value(row, "bat_team") || inferredBatTeam || value(row, "post_bat_team"),
      fld_team: value(row, "fld_team") || inferredFldTeam || value(row, "post_fld_team"),
      batter_name: value(row, "batter_name") || value(row, "batter_name_std") || value(row, "player_name_batter"),
      pitcher_name: value(row, "pitcher_name") || value(row, "pitcher_name_std") || value(row, "player_name_pitcher") || value(row, "player_name")
    };
  });
}
