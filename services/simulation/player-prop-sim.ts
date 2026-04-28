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
};

type StatRateProfile = {
  replacementPerMinute: number;
  maxPerMinute: number;
  eliteMaxPerMinute: number;
  lowMinuteMaxPerMinute: number;
  minStd: number;
};

type RecentStatRow = {
  value: number | null;
  minutes: number | null;
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

function getMinutes(stats: unknown) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) {
    return null;
  }

  const record = stats as Record<string, unknown>;
  const keys = [
    "minutes",
    "MIN",
    "min",
    "mp",
    "MP",
    "minutesPlayed",
    "timeOnCourt",
    "playing_time"
  ];

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value > 60 ? value / 60 : value;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      const clock = trimmed.match(/^(\d{1,2}):(\d{2})$/);
      if (clock) {
        return Number(clock[1]) + Number(clock[2]) / 60;
      }
      const parsed = Number(trimmed.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(parsed)) {
        return parsed > 60 ? parsed / 60 : parsed;
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
  if (statKey === "player_minutes") {
    return "workload";
  }
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

function isBasketballLeague(leagueKey: string) {
  return leagueKey === "NBA" || leagueKey === "NCAAB";
}

function statRateProfile(leagueKey: string, statKey: string): StatRateProfile | null {
  if (!isBasketballLeague(leagueKey)) {
    return null;
  }

  const college = leagueKey === "NCAAB";

  switch (statKey) {
    case "player_points":
      return {
        replacementPerMinute: college ? 0.29 : 0.33,
        maxPerMinute: college ? 0.88 : 0.95,
        eliteMaxPerMinute: college ? 1.04 : 1.16,
        lowMinuteMaxPerMinute: college ? 0.68 : 0.74,
        minStd: college ? 3.2 : 3.5
      };
    case "player_rebounds":
      return {
        replacementPerMinute: college ? 0.13 : 0.15,
        maxPerMinute: college ? 0.4 : 0.43,
        eliteMaxPerMinute: college ? 0.52 : 0.56,
        lowMinuteMaxPerMinute: college ? 0.31 : 0.34,
        minStd: 2.2
      };
    case "player_assists":
      return {
        replacementPerMinute: college ? 0.06 : 0.07,
        maxPerMinute: college ? 0.29 : 0.32,
        eliteMaxPerMinute: college ? 0.39 : 0.44,
        lowMinuteMaxPerMinute: college ? 0.2 : 0.23,
        minStd: 1.6
      };
    case "player_threes":
      return {
        replacementPerMinute: college ? 0.032 : 0.037,
        maxPerMinute: college ? 0.14 : 0.16,
        eliteMaxPerMinute: college ? 0.2 : 0.23,
        lowMinuteMaxPerMinute: college ? 0.105 : 0.12,
        minStd: 0.9
      };
    default:
      return null;
  }
}

function inferMinutesFromStat(statKey: string, rawMean: number, marketLine: number | null | undefined, leagueKey: string) {
  const cap = leagueKey === "NCAAB" ? 36 : 38.5;
  const reference = typeof marketLine === "number" && Number.isFinite(marketLine)
    ? Math.max(rawMean, marketLine)
    : rawMean;

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
  const minutes = args.rows
    .map((row) => row.minutes)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0.25);

  const weightedMinutes = weightedAverage(minutes);
  const averageMinutes = average(minutes);
  let projectedMinutes = minutes.length
    ? weightedMinutes * 0.72 + averageMinutes * 0.28
    : inferMinutesFromStat(args.statKey, args.rawMean, args.marketLine, args.leagueKey);

  const paceWorkload = ((args.teamStyle?.paceDelta ?? 0) + ((args.interactionContext?.paceMultiplier ?? 1) - 1) * 100) * 0.0012;
  const restWorkload = ((args.playerIntangibles?.restEdge ?? 0) * 0.002) - ((args.playerIntangibles?.fatigueRisk ?? 0) * 0.004) - ((args.playerIntangibles?.travelStress ?? 0) * 0.0025);
  projectedMinutes *= clamp(1 + paceWorkload + restWorkload, 0.86, 1.06);

  if (minutes.length > 0 && averageMinutes < 8) {
    projectedMinutes = Math.min(projectedMinutes, 13.5);
  } else if (minutes.length > 0 && averageMinutes < 14) {
    projectedMinutes = Math.min(projectedMinutes, 20);
  } else if (minutes.length > 0 && averageMinutes < 21) {
    projectedMinutes = Math.min(projectedMinutes, 27);
  }

  if (minutes.length < 3) {
    projectedMinutes = Math.min(projectedMinutes, 24);
  } else if (minutes.length < 5) {
    projectedMinutes = Math.min(projectedMinutes, 31);
  }

  return {
    projectedMinutes: clamp(projectedMinutes, 0, cap),
    minutes,
    averageMinutes,
    weightedMinutes
  };
}

function calculateBasketballPropMean(args: {
  leagueKey: string;
  statKey: string;
  rows: RecentStatRow[];
  rawMean: number;
  recentMedian: number;
  projectedMinutes: number;
  ratingMean: number;
}) {
  const profile = statRateProfile(args.leagueKey, args.statKey);
  if (!profile) {
    return null;
  }

  const perMinuteRates = args.rows
    .filter((row): row is { value: number; minutes: number } =>
      typeof row.value === "number" &&
      typeof row.minutes === "number" &&
      Number.isFinite(row.value) &&
      Number.isFinite(row.minutes) &&
      row.minutes >= 4
    )
    .map((row) => row.value / Math.max(1, row.minutes));

  const observedRate = perMinuteRates.length ? weightedAverage(perMinuteRates) : args.projectedMinutes > 0 ? args.rawMean / args.projectedMinutes : 0;
  const elite = args.ratingMean >= 88 || args.rawMean >= (args.statKey === "player_points" ? 23 : args.statKey === "player_assists" ? 7 : args.statKey === "player_rebounds" ? 9 : 3.5);
  const rateCeiling = args.projectedMinutes < 18
    ? profile.lowMinuteMaxPerMinute
    : elite
      ? profile.eliteMaxPerMinute
      : profile.maxPerMinute;
  const clippedRate = clamp(observedRate, 0, rateCeiling);

  const sampleReliability = clamp(perMinuteRates.length / 8, 0.15, 1);
  const roleShrink = args.projectedMinutes < 12 ? 0.46 : args.projectedMinutes < 22 ? 0.32 : 0.18;
  const priorWeight = clamp((1 - sampleReliability) * 0.42 + roleShrink, 0.12, 0.68);
  const stableRate = clippedRate * (1 - priorWeight) + profile.replacementPerMinute * priorWeight;
  const minuteAdjustedMean = stableRate * args.projectedMinutes;

  const rawBlend = sampleReliability >= 0.7 ? 0.28 : sampleReliability >= 0.45 ? 0.18 : 0.08;
  const finalMean = minuteAdjustedMean * (1 - rawBlend) + args.rawMean * rawBlend;
  const absoluteCap = rateCeiling * args.projectedMinutes;

  return {
    mean: clamp(finalMean, 0, Math.max(0.1, absoluteCap)),
    perMinuteRate: stableRate,
    priorWeight,
    rateCeiling,
    sampleReliability,
    perMinuteSampleSize: perMinuteRates.length
  };
}

export function simulatePlayerPropProjection(input: PlayerPropSimulationInput): PlayerPropSimulationSummary {
  const valueKeys = statKeys(input.statKey);
  const rows: RecentStatRow[] = input.recentStats.map((row) => ({
    value: input.statKey === "player_minutes" ? getMinutes(row) : getNumber(row, valueKeys),
    minutes: getMinutes(row)
  }));
  const values = rows
    .map((row) => row.value)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

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
  let projectedMinutes: number | null = null;
  let perMinuteRate: number | null = null;
  let rolePriorWeight = 0;

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
  } else if (family === "workload") {
    contextMultiplier += paceLift * 0.2;
  } else {
    contextMultiplier += paceLift * 0.5;
  }

  contextMultiplier -= fatiguePenalty;
  contextMultiplier += ((input.playerIntangibles?.revengeBoost ?? 0) + (input.playerIntangibles?.morale ?? 0)) * 0.0025;
  contextMultiplier = isBasketballLeague(input.leagueKey)
    ? clamp(contextMultiplier, 0.88, 1.12)
    : clamp(contextMultiplier, 0.75, 1.25);

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

    if (input.statKey === "player_minutes") {
      meanValue = projectedMinutes;
      rolePriorWeight = minuteProjection.minutes.length < 5 ? 0.35 : 0.18;
      drivers.push(`Workload projected from ${minuteProjection.minutes.length} recent minute samples.`);
    } else {
      const adjusted = calculateBasketballPropMean({
        leagueKey: input.leagueKey,
        statKey: input.statKey,
        rows,
        rawMean: meanValue,
        recentMedian,
        projectedMinutes,
        ratingMean
      });

      if (adjusted) {
        meanValue = adjusted.mean;
        perMinuteRate = adjusted.perMinuteRate;
        rolePriorWeight = adjusted.priorWeight;
        drivers.push(`NBA workload model: ${round(projectedMinutes, 1)} projected minutes, ${round(perMinuteRate, 3)} per-minute rate.`);
        if (adjusted.sampleReliability < 0.5) {
          drivers.push("Sparse recent sample shrunk toward replacement-level role prior.");
        }
        if (perMinuteRate >= adjusted.rateCeiling * 0.98) {
          drivers.push("Per-minute production capped by realistic role ceiling.");
        }
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
      const finalRateCap = projectedMinutes < 18
        ? profile.lowMinuteMaxPerMinute
        : elite
          ? profile.eliteMaxPerMinute
          : profile.maxPerMinute;
      meanValue = Math.min(meanValue, finalRateCap * projectedMinutes);
    }
  }

  const basketballProfile = statRateProfile(input.leagueKey, input.statKey);
  const stdFloor = basketballProfile?.minStd ?? 0.75;
  const stdDev = Math.max(stdFloor, baseStd * clamp((input.interactionContext?.varianceMultiplier ?? 1), 0.85, 1.2));

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
  const syntheticCap = isBasketballLeague(input.leagueKey) && projectedMinutes !== null && input.statKey !== "player_minutes"
    ? Math.max(meanValue, (statRateProfile(input.leagueKey, input.statKey)?.eliteMaxPerMinute ?? 1) * projectedMinutes)
    : Number.POSITIVE_INFINITY;
  const synthetic = [...samples.map((value) => Math.min(value, syntheticCap)), meanValue, recentMedian || meanValue]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const sourceSummary =
    isBasketballLeague(input.leagueKey)
      ? "Recent production is normalized through a minutes-adjusted NBA workload model with role priors and realistic per-minute ceilings."
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
    minutesSampleSize: rows.filter((row) => typeof row.minutes === "number" && row.minutes > 0.25).length
  };
}
