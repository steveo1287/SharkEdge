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
  projectedMinutes?: number | null;
  perMinuteRate?: number | null;
  sampleSize?: number;
  minutesSampleSize?: number;
  usageRateProxy?: number | null;
  trueShootingPct?: number | null;
  opportunityRate?: number | null;
  roleConfidence?: number | null;
};

type StatRateProfile = {
  replacementPerMinute: number;
  maxPerMinute: number;
  eliteMaxPerMinute: number;
  lowMinuteMaxPerMinute: number;
  minStd: number;
};

type RecentStatRow = {
  raw: unknown;
  value: number | null;
  minutes: number | null;
  starter: boolean;
  fga: number | null;
  fgm: number | null;
  fta: number | null;
  ftm: number | null;
  threeAttempts: number | null;
  threes: number | null;
  turnovers: number | null;
  offensiveRebounds: number | null;
  defensiveRebounds: number | null;
  rebounds: number | null;
  assists: number | null;
  points: number | null;
};

type BasketballMeanResult = {
  mean: number;
  perMinuteRate: number;
  priorWeight: number;
  rateCeiling: number;
  sampleReliability: number;
  perMinuteSampleSize: number;
  usageRateProxy: number | null;
  trueShootingPct: number | null;
  opportunityRate: number | null;
  roleConfidence: number;
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
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    const weight = decay ** index;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight ? weighted / totalWeight : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function percentile(values: number[], quantile: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = clamp(Math.floor((sorted.length - 1) * quantile), 0, sorted.length - 1);
  return sorted[index];
}

function getRecord(stats: unknown): Record<string, unknown> | null {
  return stats && typeof stats === "object" && !Array.isArray(stats) ? (stats as Record<string, unknown>) : null;
}

function getNumber(stats: unknown, keys: string[]) {
  const record = getRecord(stats);
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

function getBoolean(stats: unknown, keys: string[]) {
  const record = getRecord(stats);
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

function getMinutes(stats: unknown) {
  const record = getRecord(stats);
  if (!record) return null;

  const keys = ["minutes", "MIN", "min", "mp", "MP", "minutesPlayed", "timeOnCourt", "playing_time"];
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value > 60 ? value / 60 : value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      const clock = trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if (clock) return Number(clock[1]) + Number(clock[2]) / 60;
      const parsed = Number(trimmed.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(parsed)) return parsed > 60 ? parsed / 60 : parsed;
    }
  }

  return null;
}

function normalCdf(x: number, mean: number, sd: number) {
  if (!Number.isFinite(sd) || sd <= 0) return x >= mean ? 1 : 0;
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
      return ["points", "PTS", "pts"];
    case "player_rebounds":
      return ["rebounds", "REB", "reb"];
    case "player_assists":
      return ["assists", "AST", "ast"];
    case "player_threes":
      return ["threes", "FG3M", "3PM", "fg3m"];
    case "player_minutes":
      return ["minutes", "MIN", "MP", "minutesPlayed"];
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
  if (statKey === "player_minutes") return "workload";
  if (statKey.includes("points") || statKey.includes("passing") || statKey.includes("rushing") || statKey.includes("receiving")) return "scoring_volume";
  if (statKey.includes("assists")) return "playmaking";
  if (statKey.includes("rebounds")) return "rebounding";
  if (statKey.includes("threes")) return "perimeter_volume";
  if (statKey.includes("pitcher_")) return "pitching";
  return "other";
}

function isBasketballLeague(leagueKey: string) {
  return leagueKey === "NBA" || leagueKey === "NCAAB";
}

function statRateProfile(leagueKey: string, statKey: string): StatRateProfile | null {
  if (!isBasketballLeague(leagueKey)) return null;
  const college = leagueKey === "NCAAB";

  switch (statKey) {
    case "player_points":
      return { replacementPerMinute: college ? 0.29 : 0.33, maxPerMinute: college ? 0.88 : 0.95, eliteMaxPerMinute: college ? 1.04 : 1.16, lowMinuteMaxPerMinute: college ? 0.68 : 0.74, minStd: college ? 3.2 : 3.5 };
    case "player_rebounds":
      return { replacementPerMinute: college ? 0.13 : 0.15, maxPerMinute: college ? 0.4 : 0.43, eliteMaxPerMinute: college ? 0.52 : 0.56, lowMinuteMaxPerMinute: college ? 0.31 : 0.34, minStd: 2.2 };
    case "player_assists":
      return { replacementPerMinute: college ? 0.06 : 0.07, maxPerMinute: college ? 0.29 : 0.32, eliteMaxPerMinute: college ? 0.39 : 0.44, lowMinuteMaxPerMinute: college ? 0.2 : 0.23, minStd: 1.6 };
    case "player_threes":
      return { replacementPerMinute: college ? 0.032 : 0.037, maxPerMinute: college ? 0.14 : 0.16, eliteMaxPerMinute: college ? 0.2 : 0.23, lowMinuteMaxPerMinute: college ? 0.105 : 0.12, minStd: 0.9 };
    default:
      return null;
  }
}

function buildRecentStatRows(input: PlayerPropSimulationInput, valueKeys: string[]): RecentStatRow[] {
  return input.recentStats.map((raw) => ({
    raw,
    value: input.statKey === "player_minutes" ? getMinutes(raw) : getNumber(raw, valueKeys),
    minutes: getMinutes(raw),
    starter: getBoolean(raw, ["starter", "isStarter", "started"]),
    fga: getNumber(raw, ["fieldGoalsAttempted", "FGA", "fga", "fgAttempts"]),
    fgm: getNumber(raw, ["fieldGoalsMade", "FGM", "fgm", "fgMade"]),
    fta: getNumber(raw, ["freeThrowsAttempted", "FTA", "fta", "ftAttempts"]),
    ftm: getNumber(raw, ["freeThrowsMade", "FTM", "ftm", "ftMade"]),
    threeAttempts: getNumber(raw, ["threePointAttempts", "FG3A", "3PA", "fg3a"]),
    threes: getNumber(raw, ["threes", "FG3M", "3PM", "fg3m"]),
    turnovers: getNumber(raw, ["turnovers", "TO", "tov"]),
    offensiveRebounds: getNumber(raw, ["offensiveRebounds", "OREB", "orb"]),
    defensiveRebounds: getNumber(raw, ["defensiveRebounds", "DREB", "drb"]),
    rebounds: getNumber(raw, ["rebounds", "REB", "reb"]),
    assists: getNumber(raw, ["assists", "AST", "ast"]),
    points: getNumber(raw, ["points", "PTS", "pts"])
  }));
}

function inferMinutesFromStat(statKey: string, rawMean: number, marketLine: number | null | undefined, leagueKey: string) {
  const cap = leagueKey === "NCAAB" ? 36 : 38.5;
  const reference = typeof marketLine === "number" && Number.isFinite(marketLine) ? Math.max(rawMean, marketLine) : rawMean;

  if (statKey === "player_points") {
    if (reference >= 24) return Math.min(cap, 34);
    if (reference >= 17) return Math.min(cap, 30);
    if (reference >= 10) return 24;
    if (reference >= 5) return 17;
    return 9;
  }
  if (statKey === "player_rebounds") {
    if (reference >= 10) return Math.min(cap, 32);
    if (reference >= 7) return 27;
    if (reference >= 4) return 20;
    return 11;
  }
  if (statKey === "player_assists") {
    if (reference >= 8) return Math.min(cap, 34);
    if (reference >= 5) return 29;
    if (reference >= 3) return 22;
    return 12;
  }
  if (statKey === "player_threes") {
    if (reference >= 4) return Math.min(cap, 34);
    if (reference >= 2.5) return 29;
    if (reference >= 1.2) return 21;
    return 12;
  }
  return Math.min(cap, 18);
}

function projectBasketballMinutes(args: {
  leagueKey: string;
  statKey: string;
  rows: RecentStatRow[];
  rawMean: number;
  marketLine?: number | null;
  teamStyle?: TeamPlaystyleProfile | null;
  playerIntangibles?: EventIntangibleProfile | null;
  interactionContext?: HeadToHeadSimulationContext | null;
}) {
  const cap = args.leagueKey === "NCAAB" ? 36.5 : 38.5;
  const minutes = args.rows.map((row) => row.minutes).filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0.25);
  const weightedMinutes = weightedAverage(minutes);
  const averageMinutes = average(minutes);
  const minutesStd = standardDeviation(minutes);
  const starterRate = args.rows.length ? args.rows.filter((row) => row.starter).length / args.rows.length : 0;

  let projectedMinutes = minutes.length ? weightedMinutes * 0.72 + averageMinutes * 0.28 : inferMinutesFromStat(args.statKey, args.rawMean, args.marketLine, args.leagueKey);
  const paceWorkload = ((args.teamStyle?.paceDelta ?? 0) + ((args.interactionContext?.paceMultiplier ?? 1) - 1) * 100) * 0.0012;
  const restWorkload = ((args.playerIntangibles?.restEdge ?? 0) * 0.002) - ((args.playerIntangibles?.fatigueRisk ?? 0) * 0.004) - ((args.playerIntangibles?.travelStress ?? 0) * 0.0025);
  projectedMinutes *= clamp(1 + paceWorkload + restWorkload, 0.86, 1.06);

  if (minutes.length > 0 && starterRate < 0.25) projectedMinutes = Math.min(projectedMinutes, 24);
  if (minutes.length > 0 && averageMinutes < 8) projectedMinutes = Math.min(projectedMinutes, 13.5);
  else if (minutes.length > 0 && averageMinutes < 14) projectedMinutes = Math.min(projectedMinutes, 20);
  else if (minutes.length > 0 && averageMinutes < 21) projectedMinutes = Math.min(projectedMinutes, 27);

  if (minutes.length < 3) projectedMinutes = Math.min(projectedMinutes, 24);
  else if (minutes.length < 5) projectedMinutes = Math.min(projectedMinutes, 31);

  const minuteStability = minutes.length >= 2 ? clamp(1 - minutesStd / Math.max(6, averageMinutes), 0.15, 1) : 0.25;
  const sampleConfidence = clamp(minutes.length / 10, 0.1, 1);
  const roleConfidence = clamp(sampleConfidence * 0.58 + minuteStability * 0.27 + starterRate * 0.15, 0.1, 1);

  return {
    projectedMinutes: clamp(projectedMinutes, 0, cap),
    minutes,
    averageMinutes,
    weightedMinutes,
    minutesStd,
    starterRate,
    roleConfidence
  };
}

function safeRate(numerator: number | null, denominator: number | null, fallback = 0) {
  if (typeof numerator !== "number" || typeof denominator !== "number" || denominator <= 0) return fallback;
  return numerator / denominator;
}

function rowUsage(row: RecentStatRow) {
  if (typeof row.minutes !== "number" || row.minutes < 4) return null;
  const fga = row.fga ?? 0;
  const fta = row.fta ?? 0;
  const turnovers = row.turnovers ?? 0;
  return (fga + 0.44 * fta + turnovers) / Math.max(1, row.minutes);
}

function rowTrueShooting(row: RecentStatRow) {
  const shootingPossessions = (row.fga ?? 0) + 0.44 * (row.fta ?? 0);
  if (typeof row.points !== "number" || shootingPossessions <= 0) return null;
  return clamp(row.points / (2 * shootingPossessions), 0.25, 0.82);
}

function rowPointsPerScoringOpportunity(row: RecentStatRow) {
  const scoringOpportunities = (row.fga ?? 0) + 0.44 * (row.fta ?? 0);
  if (typeof row.points !== "number" || scoringOpportunities <= 0) return null;
  return clamp(row.points / scoringOpportunities, 0.45, 1.85);
}

function calculateBasketballPropMean(args: {
  leagueKey: string;
  statKey: string;
  rows: RecentStatRow[];
  rawMean: number;
  projectedMinutes: number;
  ratingMean: number;
  roleConfidence: number;
}): BasketballMeanResult | null {
  const profile = statRateProfile(args.leagueKey, args.statKey);
  if (!profile) return null;

  const qualifiedRows = args.rows.filter((row): row is RecentStatRow & { value: number; minutes: number } =>
    typeof row.value === "number" && typeof row.minutes === "number" && Number.isFinite(row.value) && Number.isFinite(row.minutes) && row.minutes >= 4
  );
  const perMinuteRates = qualifiedRows.map((row) => row.value / Math.max(1, row.minutes));
  const observedRate = perMinuteRates.length ? weightedAverage(perMinuteRates) : args.projectedMinutes > 0 ? args.rawMean / args.projectedMinutes : 0;

  const usageRates = qualifiedRows.map(rowUsage).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const trueShootingRates = qualifiedRows.map(rowTrueShooting).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const pointsPerOpportunity = qualifiedRows.map(rowPointsPerScoringOpportunity).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const usageRateProxy = usageRates.length ? weightedAverage(usageRates) : null;
  const trueShootingPct = trueShootingRates.length ? weightedAverage(trueShootingRates) : null;
  const pointsPerOpp = pointsPerOpportunity.length ? weightedAverage(pointsPerOpportunity) : null;

  const elite = args.ratingMean >= 88 || args.rawMean >= (args.statKey === "player_points" ? 23 : args.statKey === "player_assists" ? 7 : args.statKey === "player_rebounds" ? 9 : 3.5);
  const rateCeiling = args.projectedMinutes < 18 ? profile.lowMinuteMaxPerMinute : elite ? profile.eliteMaxPerMinute : profile.maxPerMinute;
  const clippedRate = clamp(observedRate, 0, rateCeiling);
  const sampleReliability = clamp(perMinuteRates.length / 10, 0.12, 1);
  const roleShrink = args.projectedMinutes < 12 ? 0.52 : args.projectedMinutes < 22 ? 0.35 : 0.16;
  const priorWeight = clamp((1 - sampleReliability) * 0.38 + roleShrink + (1 - args.roleConfidence) * 0.18, 0.1, 0.75);
  const stableRate = clippedRate * (1 - priorWeight) + profile.replacementPerMinute * priorWeight;

  let advancedMean: number | null = null;
  let opportunityRate: number | null = null;

  if (args.statKey === "player_points" && usageRateProxy !== null && pointsPerOpp !== null) {
    opportunityRate = usageRateProxy;
    advancedMean = args.projectedMinutes * clamp(usageRateProxy, 0.08, elite ? 0.72 : 0.58) * pointsPerOpp;
  } else if (args.statKey === "player_threes") {
    const threeAttemptRates = qualifiedRows
      .map((row) => safeRate(row.threeAttempts, row.minutes, NaN))
      .filter((value) => Number.isFinite(value));
    const threePctRates = qualifiedRows
      .map((row) => safeRate(row.threes, row.threeAttempts, NaN))
      .filter((value) => Number.isFinite(value));
    const threeAttemptRate = threeAttemptRates.length ? weightedAverage(threeAttemptRates) : null;
    const threePct = threePctRates.length ? clamp(weightedAverage(threePctRates), 0.22, elite ? 0.46 : 0.43) : null;
    if (threeAttemptRate !== null && threePct !== null) {
      opportunityRate = threeAttemptRate;
      advancedMean = args.projectedMinutes * clamp(threeAttemptRate, 0.02, elite ? 0.55 : 0.42) * threePct;
    }
  } else if (args.statKey === "player_rebounds") {
    const rebRates = qualifiedRows.map((row) => safeRate(row.rebounds, row.minutes, NaN)).filter((value) => Number.isFinite(value));
    const orebRates = qualifiedRows.map((row) => safeRate(row.offensiveRebounds, row.minutes, NaN)).filter((value) => Number.isFinite(value));
    const drebRates = qualifiedRows.map((row) => safeRate(row.defensiveRebounds, row.minutes, NaN)).filter((value) => Number.isFinite(value));
    const rebRate = rebRates.length ? weightedAverage(rebRates) : null;
    const splitRate = orebRates.length || drebRates.length ? weightedAverage(orebRates) + weightedAverage(drebRates) : null;
    opportunityRate = rebRate ?? splitRate;
    if (opportunityRate !== null) advancedMean = args.projectedMinutes * clamp(opportunityRate, 0.04, elite ? 0.56 : 0.43);
  } else if (args.statKey === "player_assists") {
    const assistRates = qualifiedRows.map((row) => safeRate(row.assists, row.minutes, NaN)).filter((value) => Number.isFinite(value));
    const assistRate = assistRates.length ? weightedAverage(assistRates) : null;
    opportunityRate = assistRate;
    if (assistRate !== null) advancedMean = args.projectedMinutes * clamp(assistRate, 0.015, elite ? 0.44 : 0.32);
  }

  const minuteAdjustedMean = stableRate * args.projectedMinutes;
  const advancedWeight = advancedMean !== null ? clamp(0.26 + sampleReliability * 0.22 + args.roleConfidence * 0.12, 0.22, 0.6) : 0;
  const rawBlend = sampleReliability >= 0.75 ? 0.18 : sampleReliability >= 0.45 ? 0.1 : 0.04;
  const modeledMean = advancedMean !== null ? minuteAdjustedMean * (1 - advancedWeight) + advancedMean * advancedWeight : minuteAdjustedMean;
  const finalMean = modeledMean * (1 - rawBlend) + args.rawMean * rawBlend;
  const absoluteCap = rateCeiling * args.projectedMinutes;

  return {
    mean: clamp(finalMean, 0, Math.max(0.1, absoluteCap)),
    perMinuteRate: stableRate,
    priorWeight,
    rateCeiling,
    sampleReliability,
    perMinuteSampleSize: perMinuteRates.length,
    usageRateProxy,
    trueShootingPct,
    opportunityRate,
    roleConfidence: args.roleConfidence
  };
}

export function simulatePlayerPropProjection(input: PlayerPropSimulationInput): PlayerPropSimulationSummary {
  const valueKeys = statKeys(input.statKey);
  const rows = buildRecentStatRows(input, valueKeys);
  const values = rows.map((row) => row.value).filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  const weightedMean = weightedAverage(values);
  const seasonLikeMean = average(values);
  const recentMedian = percentile(values, 0.5);
  const sampleStd = standardDeviation(values);
  const minStd = Math.max(0.8, Math.abs(weightedMean) * 0.12);
  const baseStd = Math.max(minStd, sampleStd);

  const ratings = input.recentStats.map((row) => getNumber(row, ratingKeys(input.leagueKey))).filter((value): value is number => typeof value === "number");
  const ratingMean = average(ratings);
  const ratingPriorWeight = ratings.length ? clamp((ratings.length / Math.max(1, input.recentStats.length)) * 0.08, 0.02, 0.08) : 0;

  let meanValue = weightedMean || seasonLikeMean || 0;
  const family = marketFamily(input.statKey);
  const drivers: string[] = [];
  let projectedMinutes: number | null = null;
  let perMinuteRate: number | null = null;
  let rolePriorWeight = 0;
  let usageRateProxy: number | null = null;
  let trueShootingPct: number | null = null;
  let opportunityRate: number | null = null;
  let roleConfidence: number | null = null;

  const paceLift = (((input.teamStyle?.paceDelta ?? 0) + ((input.interactionContext?.paceMultiplier ?? 1) - 1) * 100) * 0.006) + ((input.teamCoach?.aggression ?? 50) - 50) * 0.0025 - ((input.opponentCoach?.tempoControl ?? 50) - 50) * 0.0018;
  const opponentResistance = ((input.opponentStyle?.defenseResistance ?? 50) - 50) * 0.005;
  const fatiguePenalty = ((input.playerIntangibles?.fatigueRisk ?? 0) * 0.006) + ((input.playerIntangibles?.travelStress ?? 0) * 0.004) - ((input.playerIntangibles?.restEdge ?? 0) * 0.0035);

  let contextMultiplier = 1;
  if (family === "scoring_volume") {
    contextMultiplier += paceLift + ((input.teamStyle?.offensePressure ?? 50) - 50) * 0.004 - opponentResistance;
  } else if (family === "playmaking") {
    contextMultiplier += paceLift * 0.85 + ((input.teamStyle?.possessionControl ?? 50) - 50) * 0.003 + ((input.teamCoach?.adaptability ?? 50) - 50) * 0.0015 - opponentResistance * 0.85;
  } else if (family === "rebounding") {
    contextMultiplier += (((input.teamStyle?.shotVolume ?? 50) + (input.opponentStyle?.shotVolume ?? 50)) / 2 - 50) * 0.0022;
    contextMultiplier += ((input.interactionContext?.varianceMultiplier ?? 1) - 1) * 0.4;
  } else if (family === "perimeter_volume") {
    contextMultiplier += paceLift * 0.8 + ((input.teamCoach?.aggression ?? 50) - 50) * 0.003 - opponentResistance * 0.75;
  } else if (family === "pitching") {
    contextMultiplier += ((input.opponentStyle?.offensePressure ?? 50) - 50) * -0.0035 + ((input.teamCoach?.tempoControl ?? 50) - 50) * 0.002;
  } else if (family === "workload") {
    contextMultiplier += paceLift * 0.2;
  } else {
    contextMultiplier += paceLift * 0.5;
  }

  contextMultiplier -= fatiguePenalty;
  contextMultiplier += ((input.playerIntangibles?.revengeBoost ?? 0) + (input.playerIntangibles?.morale ?? 0)) * 0.0025;
  contextMultiplier = isBasketballLeague(input.leagueKey) ? clamp(contextMultiplier, 0.88, 1.12) : clamp(contextMultiplier, 0.75, 1.25);

  if (isBasketballLeague(input.leagueKey)) {
    const minuteProjection = projectBasketballMinutes({
      leagueKey: input.leagueKey,
      statKey: input.statKey,
      rows,
      rawMean: meanValue,
      marketLine: input.marketLine,
      teamStyle: input.teamStyle,
      playerIntangibles: input.playerIntangibles,
      interactionContext: input.interactionContext
    });
    projectedMinutes = minuteProjection.projectedMinutes;
    roleConfidence = minuteProjection.roleConfidence;

    if (input.statKey === "player_minutes") {
      meanValue = projectedMinutes;
      rolePriorWeight = minuteProjection.minutes.length < 5 ? 0.35 : 0.18;
      drivers.push(`Workload projected from ${minuteProjection.minutes.length} recent minute samples.`);
      if (minuteProjection.minutesStd >= 5.5) drivers.push("Minutes volatility is elevated; distribution widened.");
    } else {
      const adjusted = calculateBasketballPropMean({
        leagueKey: input.leagueKey,
        statKey: input.statKey,
        rows,
        rawMean: meanValue,
        projectedMinutes,
        ratingMean,
        roleConfidence: minuteProjection.roleConfidence
      });

      if (adjusted) {
        meanValue = adjusted.mean;
        perMinuteRate = adjusted.perMinuteRate;
        rolePriorWeight = adjusted.priorWeight;
        usageRateProxy = adjusted.usageRateProxy;
        trueShootingPct = adjusted.trueShootingPct;
        opportunityRate = adjusted.opportunityRate;
        roleConfidence = adjusted.roleConfidence;
        drivers.push(`NBA possession model: ${round(projectedMinutes, 1)} min, ${round(perMinuteRate, 3)} per-min, ${round(adjusted.roleConfidence * 100, 0)}% role confidence.`);
        if (adjusted.usageRateProxy !== null) drivers.push(`Usage proxy ${round(adjusted.usageRateProxy, 3)} scoring chances/min.`);
        if (adjusted.trueShootingPct !== null) drivers.push(`True-shooting proxy ${round(adjusted.trueShootingPct * 100, 1)}%.`);
        if (adjusted.sampleReliability < 0.5) drivers.push("Sparse recent sample shrunk toward replacement-level role prior.");
        if (perMinuteRate >= adjusted.rateCeiling * 0.98) drivers.push("Per-minute production capped by realistic role ceiling.");
      }
    }
  }

  if (ratingPriorWeight > 0 && ratingMean > 0 && !isBasketballLeague(input.leagueKey)) {
    const ratingFactor = clamp(1 + ((ratingMean - 75) / 100) * ratingPriorWeight * 2.2, 0.94, 1.06);
    meanValue *= ratingFactor;
    drivers.push(`Ratings prior contributes ${(ratingPriorWeight * 100).toFixed(0)}% bounded weight.`);
  }

  meanValue *= contextMultiplier;

  if (isBasketballLeague(input.leagueKey) && projectedMinutes !== null && input.statKey !== "player_minutes") {
    const profile = statRateProfile(input.leagueKey, input.statKey);
    if (profile) {
      const elite = ratingMean >= 88 || weightedMean >= (input.statKey === "player_points" ? 23 : input.statKey === "player_assists" ? 7 : input.statKey === "player_rebounds" ? 9 : 3.5);
      const finalRateCap = projectedMinutes < 18 ? profile.lowMinuteMaxPerMinute : elite ? profile.eliteMaxPerMinute : profile.maxPerMinute;
      meanValue = Math.min(meanValue, finalRateCap * projectedMinutes);
    }
  }

  const basketballProfile = statRateProfile(input.leagueKey, input.statKey);
  const stdFloor = basketballProfile?.minStd ?? 0.75;
  const minutesStd = standardDeviation(rows.map((row) => row.minutes).filter((value): value is number => typeof value === "number" && value > 0));
  const volatilityMultiplier = isBasketballLeague(input.leagueKey)
    ? clamp((input.interactionContext?.varianceMultiplier ?? 1) * (1 + Math.min(0.22, minutesStd / 120)) * (roleConfidence !== null ? 1 + (1 - roleConfidence) * 0.22 : 1), 0.85, 1.35)
    : clamp((input.interactionContext?.varianceMultiplier ?? 1), 0.85, 1.2);
  const stdDev = Math.max(stdFloor, baseStd * volatilityMultiplier);

  if (Math.abs(contextMultiplier - 1) >= 0.03) drivers.push(`Context multiplier ${contextMultiplier > 1 ? "+" : ""}${round((contextMultiplier - 1) * 100, 1)}%.`);
  if ((input.teamStyle?.paceDelta ?? 0) >= 8) drivers.push("Team pace profile is materially above baseline.");
  if ((input.opponentStyle?.defenseResistance ?? 50) >= 60) drivers.push("Opponent defensive resistance is elevated.");
  if ((input.playerIntangibles?.fatigueRisk ?? 0) >= 12) drivers.push("Fatigue risk is elevated.");
  if ((input.playerIntangibles?.restEdge ?? 0) >= 8) drivers.push("Rest edge supports workload stability.");

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
  const syntheticCap = isBasketballLeague(input.leagueKey) && projectedMinutes !== null && input.statKey !== "player_minutes"
    ? Math.max(meanValue, (statRateProfile(input.leagueKey, input.statKey)?.eliteMaxPerMinute ?? 1) * projectedMinutes)
    : Number.POSITIVE_INFINITY;
  const synthetic = [...samples.map((value) => Math.min(value, syntheticCap)), meanValue, recentMedian || meanValue].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sourceSummary = isBasketballLeague(input.leagueKey)
    ? "Recent production is normalized through a possession-aware NBA workload model using minutes, usage proxy, shooting efficiency, opportunity rates, role confidence, and realistic ceilings."
    : ratings.length
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
    priorWeight: round(Math.max(ratingPriorWeight, rolePriorWeight), 4),
    sourceSummary,
    projectedMinutes: projectedMinutes !== null ? round(projectedMinutes, 2) : null,
    perMinuteRate: perMinuteRate !== null ? round(perMinuteRate, 4) : null,
    sampleSize: values.length,
    minutesSampleSize: rows.filter((row) => typeof row.minutes === "number" && row.minutes > 0.25).length,
    usageRateProxy: usageRateProxy !== null ? round(usageRateProxy, 4) : null,
    trueShootingPct: trueShootingPct !== null ? round(trueShootingPct, 4) : null,
    opportunityRate: opportunityRate !== null ? round(opportunityRate, 4) : null,
    roleConfidence: roleConfidence !== null ? round(roleConfidence, 4) : null
  };
}
