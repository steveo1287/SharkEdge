export type NbaStatKey =
  | "points"
  | "rebounds"
  | "assists"
  | "threes"
  | "steals"
  | "blocks"
  | "turnovers"
  | "pra";

export type NbaPlayerBoxScoreRow = Record<string, unknown>;

export type NbaPlayerAttributes = {
  scoringSkill: number;
  threePointSkill: number;
  rimFinishingSkill: number;
  freeThrowSkill: number;
  passingSkill: number;
  reboundingSkill: number;
  stealSkill: number;
  blockSkill: number;
  turnoverRisk: number;
  foulRisk: number;
  usageCeiling: number;
  usageFloor: number;
  volatility: number;
};

export type NbaPlayerTendencies = {
  usageRate: number;
  shotAttemptRate: number;
  threePointAttemptRate: number;
  freeThrowAttemptRate: number;
  assistCreationRate: number;
  reboundChanceRate: number;
  offensiveReboundChanceRate: number;
  defensiveReboundChanceRate: number;
  stealRate: number;
  blockRate: number;
  turnoverRate: number;
  touchesPerMinute: number;
};

export type NbaPlayerStatProfile = {
  playerId: string;
  playerName: string;
  team?: string | null;
  position?: string | null;
  sampleSize: number;
  recentWindow: number;
  minutes: {
    average: number;
    weighted: number;
    stdDev: number;
    starterRate: number;
  };
  attributes: NbaPlayerAttributes;
  tendencies: NbaPlayerTendencies;
  statRatesPerMinute: Record<NbaStatKey, number>;
  statStdDev: Record<NbaStatKey, number>;
  reliability: number;
  warnings: string[];
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 4) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function weightedAverage(values: number[], decay = 0.88) {
  let weighted = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const weight = decay ** index;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight ? weighted / totalWeight : 0;
}

function stdDev(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function getRecord(row: unknown) {
  return row && typeof row === "object" && !Array.isArray(row) ? row as Record<string, unknown> : null;
}

function num(row: unknown, keys: string[]) {
  const record = getRecord(row);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function bool(row: unknown, keys: string[]) {
  const record = getRecord(row);
  if (!record) return false;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.toLowerCase().trim();
      if (["true", "yes", "y", "starter", "start"].includes(normalized)) return true;
      if (["false", "no", "n", "bench"].includes(normalized)) return false;
    }
  }
  return false;
}

function minutes(row: unknown) {
  const value = num(row, ["minutes", "MIN", "min", "mp", "MP", "minutesPlayed"]);
  if (value !== null) return value > 60 ? value / 60 : value;
  const record = getRecord(row);
  const raw = record?.minutes ?? record?.MIN ?? record?.MP;
  if (typeof raw === "string") {
    const match = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (match) return Number(match[1]) + Number(match[2]) / 60;
  }
  return null;
}

const STAT_KEYS: Record<NbaStatKey, string[]> = {
  points: ["points", "PTS", "pts"],
  rebounds: ["rebounds", "REB", "reb"],
  assists: ["assists", "AST", "ast"],
  threes: ["threes", "FG3M", "3PM", "fg3m"],
  steals: ["steals", "STL", "stl"],
  blocks: ["blocks", "BLK", "blk"],
  turnovers: ["turnovers", "TOV", "TO", "tov"],
  pra: ["pra", "pointsReboundsAssists", "PRA"]
};

function statValue(row: unknown, stat: NbaStatKey) {
  if (stat === "pra") {
    const explicit = num(row, STAT_KEYS.pra);
    if (explicit !== null) return explicit;
    return (num(row, STAT_KEYS.points) ?? 0) + (num(row, STAT_KEYS.rebounds) ?? 0) + (num(row, STAT_KEYS.assists) ?? 0);
  }
  return num(row, STAT_KEYS[stat]);
}

function rate(values: number[], minuteValues: number[]) {
  const rates = values.map((value, index) => {
    const min = minuteValues[index] ?? 0;
    return min >= 4 ? value / min : null;
  }).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return rates.length ? weightedAverage(rates) : 0;
}

function safeDivide(numerator: number, denominator: number, fallback = 0) {
  return denominator > 0 ? numerator / denominator : fallback;
}

function skillFromRate(value: number, replacement: number, elite: number) {
  return round(clamp((value - replacement) / Math.max(0.001, elite - replacement), 0, 1), 3);
}

export function buildNbaPlayerStatProfile(args: {
  playerId: string;
  playerName: string;
  team?: string | null;
  position?: string | null;
  recentStats: NbaPlayerBoxScoreRow[];
  recentWindow?: number;
}): NbaPlayerStatProfile {
  const window = Math.max(1, args.recentWindow ?? 15);
  const rows = args.recentStats.slice(0, window);
  const minuteValues = rows.map(minutes).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const usableRows = rows.filter((row) => {
    const min = minutes(row);
    return typeof min === "number" && min >= 4;
  });
  const usableMinutes = usableRows.map((row) => minutes(row) ?? 0);

  const statValues = (stat: NbaStatKey) => usableRows.map((row) => statValue(row, stat)).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const statRatesPerMinute = Object.fromEntries(
    (["points", "rebounds", "assists", "threes", "steals", "blocks", "turnovers", "pra"] as NbaStatKey[])
      .map((stat) => [stat, round(rate(statValues(stat), usableMinutes), 5)])
  ) as Record<NbaStatKey, number>;
  const statStdDev = Object.fromEntries(
    (["points", "rebounds", "assists", "threes", "steals", "blocks", "turnovers", "pra"] as NbaStatKey[])
      .map((stat) => [stat, round(stdDev(statValues(stat)), 4)])
  ) as Record<NbaStatKey, number>;

  const fga = average(usableRows.map((row) => num(row, ["fieldGoalsAttempted", "FGA", "fga"]) ?? 0));
  const fgm = average(usableRows.map((row) => num(row, ["fieldGoalsMade", "FGM", "fgm"]) ?? 0));
  const threeAttempts = average(usableRows.map((row) => num(row, ["threePointAttempts", "FG3A", "3PA", "fg3a"]) ?? 0));
  const threes = average(usableRows.map((row) => num(row, STAT_KEYS.threes) ?? 0));
  const fta = average(usableRows.map((row) => num(row, ["freeThrowsAttempted", "FTA", "fta"]) ?? 0));
  const ftm = average(usableRows.map((row) => num(row, ["freeThrowsMade", "FTM", "ftm"]) ?? 0));
  const tov = average(usableRows.map((row) => num(row, STAT_KEYS.turnovers) ?? 0));
  const offensiveRebounds = average(usableRows.map((row) => num(row, ["offensiveRebounds", "OREB", "orb"]) ?? 0));
  const defensiveRebounds = average(usableRows.map((row) => num(row, ["defensiveRebounds", "DREB", "drb"]) ?? 0));
  const avgMinutes = average(usableMinutes);
  const weightedMinutes = weightedAverage(usableMinutes);
  const minutesStdDev = stdDev(usableMinutes);
  const starterRate = usableRows.length ? usableRows.filter((row) => bool(row, ["starter", "isStarter", "started"])).length / usableRows.length : 0;
  const scoringRate = statRatesPerMinute.points;
  const assistRate = statRatesPerMinute.assists;
  const reboundRate = statRatesPerMinute.rebounds;
  const usageNumerator = fga + 0.44 * fta + tov;

  const tendencies: NbaPlayerTendencies = {
    usageRate: round(clamp(safeDivide(usageNumerator, Math.max(avgMinutes, 1), 0), 0, 0.9), 4),
    shotAttemptRate: round(clamp(safeDivide(fga, Math.max(avgMinutes, 1), 0), 0, 0.75), 4),
    threePointAttemptRate: round(clamp(safeDivide(threeAttempts, Math.max(fga, 1), 0), 0, 1), 4),
    freeThrowAttemptRate: round(clamp(safeDivide(fta, Math.max(fga, 1), 0), 0, 1.4), 4),
    assistCreationRate: round(clamp(assistRate, 0, 0.45), 4),
    reboundChanceRate: round(clamp(reboundRate, 0, 0.6), 4),
    offensiveReboundChanceRate: round(clamp(safeDivide(offensiveRebounds, Math.max(avgMinutes, 1), 0), 0, 0.25), 4),
    defensiveReboundChanceRate: round(clamp(safeDivide(defensiveRebounds, Math.max(avgMinutes, 1), 0), 0, 0.45), 4),
    stealRate: round(clamp(statRatesPerMinute.steals, 0, 0.12), 4),
    blockRate: round(clamp(statRatesPerMinute.blocks, 0, 0.16), 4),
    turnoverRate: round(clamp(statRatesPerMinute.turnovers, 0, 0.22), 4),
    touchesPerMinute: round(clamp(safeDivide(usageNumerator + assistRate * avgMinutes * 1.7, Math.max(avgMinutes, 1), 0), 0, 1.4), 4)
  };

  const trueShooting = safeDivide(statValues("points").length ? average(statValues("points")) : 0, 2 * Math.max(fga + 0.44 * fta, 0.1), 0.52);
  const attributes: NbaPlayerAttributes = {
    scoringSkill: skillFromRate(scoringRate, 0.25, 0.95),
    threePointSkill: skillFromRate(safeDivide(threes, Math.max(threeAttempts, 0.1), 0.34), 0.28, 0.44),
    rimFinishingSkill: skillFromRate(trueShooting, 0.48, 0.66),
    freeThrowSkill: skillFromRate(safeDivide(ftm, Math.max(fta, 0.1), 0.76), 0.62, 0.91),
    passingSkill: skillFromRate(assistRate, 0.04, 0.32),
    reboundingSkill: skillFromRate(reboundRate, 0.09, 0.45),
    stealSkill: skillFromRate(statRatesPerMinute.steals, 0.015, 0.085),
    blockSkill: skillFromRate(statRatesPerMinute.blocks, 0.01, 0.11),
    turnoverRisk: skillFromRate(statRatesPerMinute.turnovers, 0.015, 0.14),
    foulRisk: skillFromRate(rate(usableRows.map((row) => num(row, ["personalFouls", "PF", "fouls"]) ?? 0), usableMinutes), 0.03, 0.16),
    usageCeiling: round(clamp(tendencies.usageRate + stdDev(usableRows.map((row) => {
      const min = minutes(row) ?? 1;
      return ((num(row, ["fieldGoalsAttempted", "FGA", "fga"]) ?? 0) + 0.44 * (num(row, ["freeThrowsAttempted", "FTA", "fta"]) ?? 0) + (num(row, STAT_KEYS.turnovers) ?? 0)) / Math.max(min, 1);
    })), 0, 1), 4),
    usageFloor: round(clamp(tendencies.usageRate - 0.5 * stdDev(usableRows.map((row) => {
      const min = minutes(row) ?? 1;
      return ((num(row, ["fieldGoalsAttempted", "FGA", "fga"]) ?? 0) + 0.44 * (num(row, ["freeThrowsAttempted", "FTA", "fta"]) ?? 0) + (num(row, STAT_KEYS.turnovers) ?? 0)) / Math.max(min, 1);
    })), 0, 1), 4),
    volatility: round(clamp((minutesStdDev / Math.max(6, avgMinutes)) * 0.45 + (statStdDev.points / Math.max(8, average(statValues("points")))) * 0.35 + (1 - Math.min(1, usableRows.length / 12)) * 0.2, 0, 1), 4)
  };

  const warnings: string[] = [];
  if (usableRows.length < 5) warnings.push("low recent sample");
  if (minutesStdDev >= 6) warnings.push("volatile minutes");
  if (starterRate > 0 && starterRate < 0.6) warnings.push("unstable starting role");

  return {
    playerId: args.playerId,
    playerName: args.playerName,
    team: args.team ?? null,
    position: args.position ?? null,
    sampleSize: usableRows.length,
    recentWindow: window,
    minutes: {
      average: round(avgMinutes, 3),
      weighted: round(weightedMinutes, 3),
      stdDev: round(minutesStdDev, 3),
      starterRate: round(starterRate, 3)
    },
    attributes,
    tendencies,
    statRatesPerMinute,
    statStdDev,
    reliability: round(clamp(usableRows.length / 12, 0, 1) * 0.55 + clamp(1 - minutesStdDev / Math.max(6, avgMinutes), 0, 1) * 0.35 + starterRate * 0.1, 3),
    warnings
  };
}
