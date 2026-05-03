export type CanonicalNbaPlayerGameStat = {
  minutes: number;
  points: number;
  rebounds: number;
  assists: number;
  threes: number;
  steals: number;
  blocks: number;
  turnovers: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  fieldGoalsAttempted: number;
  fieldGoalsMade: number;
  threePointAttempts: number;
  freeThrowsAttempted: number;
  freeThrowsMade: number;
  personalFouls: number;
  starter: boolean;
};

type RawRecord = Record<string, unknown>;

function recordFrom(value: unknown): RawRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RawRecord : {};
}

function candidateRecords(input: unknown): RawRecord[] {
  const root = recordFrom(input);
  const nested = [
    root.statsJson,
    root.stats_json,
    root.boxScore,
    root.box_score,
    root.statline,
    root.stats,
    root.data
  ].map(recordFrom).filter((record) => Object.keys(record).length > 0);
  return [root, ...nested];
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    const minuteMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
    if (minuteMatch) return Number(minuteMatch[1]) + Number(minuteMatch[2]) / 60;
    const parsed = Number(trimmed.replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(records: RawRecord[], keys: string[], fallback = 0) {
  for (const record of records) {
    for (const key of keys) {
      const value = parseNumber(record[key]);
      if (value !== null) return value;
    }
  }
  return fallback;
}

function firstBoolean(records: RawRecord[], keys: string[], fallback = false) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const normalized = value.toLowerCase().trim();
        if (["true", "yes", "y", "starter", "start", "started", "1"].includes(normalized)) return true;
        if (["false", "no", "n", "bench", "reserve", "0"].includes(normalized)) return false;
      }
      if (typeof value === "number" && Number.isFinite(value)) return value > 0;
    }
  }
  return fallback;
}

export function normalizeNbaPlayerGameStat(input: unknown): CanonicalNbaPlayerGameStat {
  const records = candidateRecords(input);
  const minutesRaw = firstNumber(records, ["minutes", "MIN", "min", "mp", "MP", "minutesPlayed", "secondsPlayed", "secs"], 0);
  const minutes = minutesRaw > 60 ? minutesRaw / 60 : minutesRaw;
  const rebounds = firstNumber(records, ["rebounds", "REB", "reb", "totalRebounds", "total_rebounds", "TRB", "trb"], 0);
  const offensiveRebounds = firstNumber(records, ["offensiveRebounds", "OREB", "orb", "ORB", "offensive_rebounds"], 0);
  const defensiveRebounds = firstNumber(records, ["defensiveRebounds", "DREB", "drb", "DRB", "defensive_rebounds"], 0);

  return {
    minutes,
    points: firstNumber(records, ["points", "PTS", "pts"], 0),
    rebounds: rebounds || offensiveRebounds + defensiveRebounds,
    assists: firstNumber(records, ["assists", "AST", "ast"], 0),
    threes: firstNumber(records, ["threes", "FG3M", "3PM", "fg3m", "threePointMade", "threePointersMade", "three_pointers_made"], 0),
    steals: firstNumber(records, ["steals", "STL", "stl"], 0),
    blocks: firstNumber(records, ["blocks", "BLK", "blk"], 0),
    turnovers: firstNumber(records, ["turnovers", "TOV", "TO", "tov", "turnover"], 0),
    offensiveRebounds,
    defensiveRebounds,
    fieldGoalsAttempted: firstNumber(records, ["fieldGoalsAttempted", "FGA", "fga", "field_goals_attempted"], 0),
    fieldGoalsMade: firstNumber(records, ["fieldGoalsMade", "FGM", "fgm", "field_goals_made"], 0),
    threePointAttempts: firstNumber(records, ["threePointAttempts", "FG3A", "3PA", "fg3a", "threePointAttempted", "three_pointers_attempted"], 0),
    freeThrowsAttempted: firstNumber(records, ["freeThrowsAttempted", "FTA", "fta", "free_throws_attempted"], 0),
    freeThrowsMade: firstNumber(records, ["freeThrowsMade", "FTM", "ftm", "free_throws_made"], 0),
    personalFouls: firstNumber(records, ["personalFouls", "PF", "fouls", "personal_fouls"], 0),
    starter: firstBoolean(records, ["starter", "isStarter", "started", "is_starter", "role"], false)
  };
}

export function normalizeNbaPlayerGameStats(rows: unknown[]): CanonicalNbaPlayerGameStat[] {
  return rows.map(normalizeNbaPlayerGameStat);
}
