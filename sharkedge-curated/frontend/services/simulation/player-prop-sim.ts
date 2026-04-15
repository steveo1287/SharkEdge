import type {
  CoachTendencyProfile,
  EventIntangibleProfile,
  HeadToHeadSimulationContext,
  TeamPlaystyleProfile
} from "@/services/simulation/context-profiles";

export type PlayerPropSimulationInput = {
  leagueKey: string;
  statKey: string;
  playerId: string;
  playerName: string;
  position?: string | null;
  recentStats: unknown[];
  teamStyle?: TeamPlaystyleProfile | null;
  opponentStyle?: TeamPlaystyleProfile | null;
  teamCoach?: CoachTendencyProfile | null;
  opponentCoach?: CoachTendencyProfile | null;
  playerIntangibles?: EventIntangibleProfile | null;
  interactionContext?: HeadToHeadSimulationContext | null;
  marketLine?: number | null;
  marketOddsOver?: number | null;
  marketOddsUnder?: number | null;
};

export type PlayerPropSimulationSummary = {
  meanValue: number;
  medianValue: number;
  stdDev: number;
  p10: number;
  p50: number;
  p90: number;
  hitProbOver: Record<string, number>;
  hitProbUnder: Record<string, number>;
  contextualEdgeScore: number;
  drivers: string[];
  priorWeight: number;
  sourceSummary: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function weightedAverage(values: Array<number | null | undefined>, decay = 0.88) {
  let weighted = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return;
    }
    const weight = decay ** index;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight ? weighted / totalWeight : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function percentile(values: number[], quantile: number) {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.floor((sorted.length - 1) * quantile), 0, sorted.length - 1);
  return sorted[index];
}

function getNumber(stats: unknown, keys: string[]) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return null;
  }
  const record = stats as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function normalCdf(x: number, mean: number, sd: number) {
  if (!Number.isFinite(sd) || sd <= 0) {
    return x >= mean ? 1 : 0;
  }
  const z = (x - mean) / (sd * Math.sqrt(2));
  return 0.5 * (1 + erf(z));
}

function erf(x: number) {
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

function statKeys(statKey: string) {
  switch (statKey) {
    case "player_points":
      return ["points", "PTS"];
    case "player_rebounds":
      return ["rebounds", "REB"];
    case "player_assists":
      return ["assists", "AST"];
    case "player_threes":
      return ["threes", "FG3M", "3PM"];
    case "player_pitcher_outs":
      return ["outs", "pitcher_outs", "recorded_outs"];
    case "player_pitcher_strikeouts":
      return ["strikeouts", "SO", "Ks", "pitcher_strikeouts"];
    default:
      if (statKey.includes("passing")) return ["passing_yards", "pass_yds"];
      if (statKey.includes("rushing")) return ["rushing_yards", "rush_yds"];
      if (statKey.includes("receiving")) return ["receiving_yards", "rec_yds"];
      if (statKey.includes("receptions")) return ["receptions", "REC"];
      return [statKey, "points"];
  }
}

function ratingKeys(leagueKey: string) {
  switch (leagueKey) {
    case "NBA":
    case "NCAAB":
      return ["overall", "ovr", "overallRating", "rating_2k", "nba2k_overall"];
    case "NFL":
    case "NCAAF":
      return ["overall", "ovr", "overallRating", "madden_overall", "rating_madden", "ea_overall"];
    case "MLB":
      return ["overall", "ovr", "overallRating", "the_show_overall", "mlb_the_show_overall"];
    default:
      return ["overall", "ovr", "overallRating"];
  }
}

function marketFamily(statKey: string) {
  if (statKey.includes("points") || statKey.includes("passing") || statKey.includes("rushing") || statKey.includes("receiving")) {
    return "scoring_volume";
  }
  if (statKey.includes("assists")) {
    return "playmaking";
  }
  if (statKey.includes("rebounds")) {
    return "rebounding";
  }
  if (statKey.includes("threes")) {
    return "perimeter_volume";
  }
  if (statKey.includes("pitcher_")) {
    return "pitching";
  }
  return "other";
}

export function simulatePlayerPropProjection(input: PlayerPropSimulationInput): PlayerPropSimulationSummary {
  const valueKeys = statKeys(input.statKey);
  const values = input.recentStats
    .map((row) => getNumber(row, valueKeys))
    .filter((value): value is number => typeof value === "number");

  const weightedMean = weightedAverage(values);
  const seasonLikeMean = average(values);
  const recentMedian = percentile(values, 0.5);
  const sampleStd = standardDeviation(values);
  const minStd = Math.max(0.8, Math.abs(weightedMean) * 0.12);
  const baseStd = Math.max(minStd, sampleStd);

  const ratings = input.recentStats
    .map((row) => getNumber(row, ratingKeys(input.leagueKey)))
    .filter((value): value is number => typeof value === "number");
  const ratingMean = average(ratings);
  const ratingPriorWeight = ratings.length ? clamp((ratings.length / Math.max(1, input.recentStats.length)) * 0.08, 0.02, 0.08) : 0;

  let meanValue = weightedMean || seasonLikeMean || 0;
  const family = marketFamily(input.statKey);
  const drivers: string[] = [];

  const paceLift =
    (((input.teamStyle?.paceDelta ?? 0) + ((input.interactionContext?.paceMultiplier ?? 1) - 1) * 100) * 0.006) +
    ((input.teamCoach?.aggression ?? 50) - 50) * 0.0025 -
    ((input.opponentCoach?.tempoControl ?? 50) - 50) * 0.0018;

  const opponentResistance =
    ((input.opponentStyle?.defenseResistance ?? 50) - 50) * 0.005;

  const fatiguePenalty =
    ((input.playerIntangibles?.fatigueRisk ?? 0) * 0.006) +
    ((input.playerIntangibles?.travelStress ?? 0) * 0.004) -
    ((input.playerIntangibles?.restEdge ?? 0) * 0.0035);

  let contextMultiplier = 1;
  if (family === "scoring_volume") {
    contextMultiplier += paceLift;
    contextMultiplier += ((input.teamStyle?.offensePressure ?? 50) - 50) * 0.004;
    contextMultiplier -= opponentResistance;
  } else if (family === "playmaking") {
    contextMultiplier += paceLift * 0.85;
    contextMultiplier += ((input.teamStyle?.possessionControl ?? 50) - 50) * 0.003;
    contextMultiplier += ((input.teamCoach?.adaptability ?? 50) - 50) * 0.0015;
    contextMultiplier -= opponentResistance * 0.85;
  } else if (family === "rebounding") {
    contextMultiplier += (((input.teamStyle?.shotVolume ?? 50) + (input.opponentStyle?.shotVolume ?? 50)) / 2 - 50) * 0.0022;
    contextMultiplier += (((input.interactionContext?.varianceMultiplier ?? 1) - 1) * 0.4);
  } else if (family === "perimeter_volume") {
    contextMultiplier += paceLift * 0.8;
    contextMultiplier += ((input.teamCoach?.aggression ?? 50) - 50) * 0.003;
    contextMultiplier -= opponentResistance * 0.75;
  } else if (family === "pitching") {
    contextMultiplier += ((input.opponentStyle?.offensePressure ?? 50) - 50) * -0.0035;
    contextMultiplier += ((input.teamCoach?.tempoControl ?? 50) - 50) * 0.002;
  } else {
    contextMultiplier += paceLift * 0.5;
  }

  contextMultiplier -= fatiguePenalty;
  contextMultiplier += ((input.playerIntangibles?.revengeBoost ?? 0) + (input.playerIntangibles?.morale ?? 0)) * 0.0025;
  contextMultiplier = clamp(contextMultiplier, 0.75, 1.25);

  if (ratingPriorWeight > 0 && ratingMean > 0) {
    const ratingFactor = clamp(1 + ((ratingMean - 75) / 100) * ratingPriorWeight * 2.2, 0.94, 1.06);
    meanValue *= ratingFactor;
    drivers.push(`Ratings prior contributes ${(ratingPriorWeight * 100).toFixed(0)}% bounded weight.`);
  }

  meanValue *= contextMultiplier;
  const stdDev = Math.max(0.75, baseStd * clamp((input.interactionContext?.varianceMultiplier ?? 1), 0.85, 1.2));

  if (Math.abs(contextMultiplier - 1) >= 0.03) {
    drivers.push(`Context multiplier ${contextMultiplier > 1 ? "+" : ""}${round((contextMultiplier - 1) * 100, 1)}%.`);
  }
  if ((input.teamStyle?.paceDelta ?? 0) >= 8) {
    drivers.push("Team pace profile is materially above baseline.");
  }
  if ((input.opponentStyle?.defenseResistance ?? 50) >= 60) {
    drivers.push("Opponent defensive resistance is elevated.");
  }
  if ((input.playerIntangibles?.fatigueRisk ?? 0) >= 12) {
    drivers.push("Fatigue risk is elevated.");
  }
  if ((input.playerIntangibles?.restEdge ?? 0) >= 8) {
    drivers.push("Rest edge supports workload stability.");
  }

  const lineKey = typeof input.marketLine === "number" ? String(input.marketLine) : null;
  const hitProbOver: Record<string, number> = {};
  const hitProbUnder: Record<string, number> = {};
  let contextualEdgeScore = 0;

  if (typeof input.marketLine === "number" && Number.isFinite(input.marketLine)) {
    const overProbability = clamp(1 - normalCdf(input.marketLine, meanValue, stdDev), 0.001, 0.999);
    const underProbability = clamp(1 - overProbability, 0.001, 0.999);
    hitProbOver[lineKey as string] = round(overProbability, 4);
    hitProbUnder[lineKey as string] = round(underProbability, 4);
    contextualEdgeScore = round((meanValue - input.marketLine) / Math.max(1, stdDev) * 20, 2);
    drivers.push(`Current market line ${input.marketLine} is ${meanValue >= input.marketLine ? "below" : "above"} the sim mean ${round(meanValue, 2)}.`);
  }

  const samples = values.length ? values : [meanValue];
  const synthetic = [...samples, meanValue, recentMedian || meanValue].filter((value): value is number => typeof value === "number");
  const sourceSummary =
    ratings.length
      ? "Recent stats anchor the sim, with video-game-style ratings bounded as a small prior."
      : "Recent stats anchor the sim. No external ratings prior was available.";

  return {
    meanValue: round(meanValue, 3),
    medianValue: round(recentMedian || meanValue, 3),
    stdDev: round(stdDev, 3),
    p10: round(percentile(synthetic, 0.1), 3),
    p50: round(percentile(synthetic, 0.5), 3),
    p90: round(percentile(synthetic, 0.9), 3),
    hitProbOver,
    hitProbUnder,
    contextualEdgeScore,
    drivers: Array.from(new Set(drivers)),
    priorWeight: round(ratingPriorWeight, 4),
    sourceSummary
  };
}
