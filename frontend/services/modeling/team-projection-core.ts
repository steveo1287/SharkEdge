import { calibrateProbabilityAgainstMarket } from "@/services/modeling/probability-calibration";
import type { WeatherAdjustment } from "@/services/modeling/weather-context";

type ProjectionSportConfig = {
  scoreBaseline: number;
  paceBaseline: number;
  homeEdge: number;
  spreadScale: number;
  targetSample: number;
};

type ProjectionInput = {
  sportKey: string;
  homeOffense: number[];
  awayOffense: number[];
  homeDefense: number[];
  awayDefense: number[];
  paceSamples: number[];
  weather?: WeatherAdjustment | null;
};

export type GenericProjectionView = {
  projectedHomeScore: number;
  projectedAwayScore: number;
  projectedTotal: number;
  projectedSpreadHome: number;
  winProbHome: number;
  winProbAway: number;
  metadata: {
    confidenceLabel: "HIGH" | "MEDIUM" | "LOW";
    confidenceScore: number;
    uncertaintyScore: number;
    confidencePenalty: number;
    paceFactor: number;
    scoreStdDev: number;
    projectionBand: {
      homeLow: number;
      homeHigh: number;
      awayLow: number;
      awayHigh: number;
      totalLow: number;
      totalHigh: number;
    };
    weather: {
      available: boolean;
      source: string;
      note: string;
      totalDelta: number;
      spreadDeltaHome: number;
      uncertaintyPenalty: number;
    };
    summaries: {
      homeOffenseWeighted: number;
      awayOffenseWeighted: number;
      homeDefenseWeighted: number;
      awayDefenseWeighted: number;
      paceWeighted: number;
    };
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

export function buildWeightedAverage(values: number[], decay = 0.88) {
  let weighted = 0;
  let totalWeight = 0;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) return;
    const weight = decay ** index;
    weighted += value * weight;
    totalWeight += weight;
  });
  return totalWeight ? weighted / totalWeight : null;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }
  const mean = average(values) ?? 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return Math.sqrt(variance);
}

function getConfig(sportKey: string): ProjectionSportConfig {
  switch (sportKey) {
    case "NBA":
      return { scoreBaseline: 113, paceBaseline: 99, homeEdge: 2.3, spreadScale: 11, targetSample: 10 };
    case "NCAAB":
      return { scoreBaseline: 72, paceBaseline: 68, homeEdge: 3.1, spreadScale: 10, targetSample: 10 };
    case "NHL":
      return { scoreBaseline: 3.15, paceBaseline: 31, homeEdge: 0.18, spreadScale: 1.4, targetSample: 10 };
    case "NFL":
    case "NCAAF":
      return { scoreBaseline: 24.5, paceBaseline: 65, homeEdge: 1.65, spreadScale: 8.8, targetSample: 8 };
    case "UFC":
    case "BOXING":
      return { scoreBaseline: 1.4, paceBaseline: 15, homeEdge: 0.05, spreadScale: 0.75, targetSample: 6 };
    default:
      return { scoreBaseline: 50, paceBaseline: 1, homeEdge: 0.8, spreadScale: 7.5, targetSample: 8 };
  }
}

export function buildGenericEventProjection(input: ProjectionInput): GenericProjectionView {
  const config = getConfig(input.sportKey);
  const homeOffenseWeighted = buildWeightedAverage(input.homeOffense) ?? config.scoreBaseline;
  const awayOffenseWeighted = buildWeightedAverage(input.awayOffense) ?? config.scoreBaseline;
  const homeDefenseWeighted = buildWeightedAverage(input.homeDefense) ?? config.scoreBaseline;
  const awayDefenseWeighted = buildWeightedAverage(input.awayDefense) ?? config.scoreBaseline;
  const paceWeighted = buildWeightedAverage(input.paceSamples) ?? config.paceBaseline;
  const paceFactor = clamp(paceWeighted / Math.max(0.1, config.paceBaseline), 0.84, 1.16);

  const homeOffenseFactor = clamp(homeOffenseWeighted / config.scoreBaseline, 0.72, 1.35);
  const awayOffenseFactor = clamp(awayOffenseWeighted / config.scoreBaseline, 0.72, 1.35);
  const homeDefenseSoftness = clamp(homeDefenseWeighted / config.scoreBaseline, 0.72, 1.35);
  const awayDefenseSoftness = clamp(awayDefenseWeighted / config.scoreBaseline, 0.72, 1.35);

  const weather = input.weather ?? null;
  const baseHomeScore =
    config.scoreBaseline *
      ((homeOffenseFactor * 0.58 + awayDefenseSoftness * 0.42) * paceFactor) +
    config.homeEdge;
  const baseAwayScore =
    config.scoreBaseline *
      ((awayOffenseFactor * 0.58 + homeDefenseSoftness * 0.42) * paceFactor) -
    config.homeEdge * 0.35;
  const weatherScoreFactor = weather?.scoreFactor ?? 1;
  const weatherTotalHalfDelta = (weather?.totalDelta ?? 0) / 2;
  const weatherSpreadHalfDelta = (weather?.spreadDeltaHome ?? 0) / 2;
  const projectedHomeScore =
    baseHomeScore * weatherScoreFactor + weatherTotalHalfDelta + weatherSpreadHalfDelta;
  const projectedAwayScore =
    baseAwayScore * weatherScoreFactor + weatherTotalHalfDelta - weatherSpreadHalfDelta;
  const projectedTotal = projectedHomeScore + projectedAwayScore;
  const projectedSpreadHome = projectedHomeScore - projectedAwayScore;

  const scoreStdDev = round(
    clamp(
      (standardDeviation(input.homeOffense) + standardDeviation(input.awayOffense) + standardDeviation(input.homeDefense) + standardDeviation(input.awayDefense)) / 4,
      config.scoreBaseline * 0.04,
      config.scoreBaseline * 0.22
    ),
    3
  );
  const sampleCoverage = clamp(
    Math.min(
      input.homeOffense.length,
      input.awayOffense.length,
      input.homeDefense.length,
      input.awayDefense.length
    ) / config.targetSample,
    0,
    1
  );
  const volatilityPenalty = clamp((scoreStdDev / config.scoreBaseline) * 90, 6, 34);
  const uncertaintyScore = clamp(
    Math.round((1 - sampleCoverage) * 42 + volatilityPenalty + (weather?.uncertaintyPenalty ?? 0) + (weather?.volatilityDelta ?? 0)),
    12,
    88
  );
  const confidenceScore = clamp(Math.round(sampleCoverage * 62 + (100 - uncertaintyScore) * 0.38), 18, 96);
  const confidenceLabel = confidenceScore >= 74 ? "HIGH" : confidenceScore >= 52 ? "MEDIUM" : "LOW";

  const calibrated = calibrateProbabilityAgainstMarket({
    modelProbability: 1 / (1 + Math.exp(-projectedSpreadHome / Math.max(0.5, config.spreadScale))),
    marketProbability: null,
    sampleSize: Math.min(
      input.homeOffense.length,
      input.awayOffense.length,
      input.homeDefense.length,
      input.awayDefense.length
    ),
    sourceConfidence: clamp(confidenceScore / 100, 0.2, 0.92),
    uncertaintyScore
  });

  return {
    projectedHomeScore: round(projectedHomeScore, 3),
    projectedAwayScore: round(projectedAwayScore, 3),
    projectedTotal: round(projectedTotal, 3),
    projectedSpreadHome: round(projectedSpreadHome, 3),
    winProbHome: calibrated.posteriorProbability ?? 0.5,
    winProbAway: round(1 - (calibrated.posteriorProbability ?? 0.5), 4),
    metadata: {
      confidenceLabel,
      confidenceScore,
      uncertaintyScore,
      confidencePenalty: calibrated.confidencePenalty,
      paceFactor: round(paceFactor, 3),
      scoreStdDev,
      projectionBand: {
        homeLow: round(projectedHomeScore - scoreStdDev, 3),
        homeHigh: round(projectedHomeScore + scoreStdDev, 3),
        awayLow: round(projectedAwayScore - scoreStdDev, 3),
        awayHigh: round(projectedAwayScore + scoreStdDev, 3),
        totalLow: round(projectedTotal - scoreStdDev * 1.4, 3),
        totalHigh: round(projectedTotal + scoreStdDev * 1.4, 3)
      },
      weather: {
        available: Boolean(weather?.available),
        source: weather?.source ?? "UNKNOWN",
        note: weather?.note ?? "No weather adjustment applied.",
        totalDelta: round(weather?.totalDelta ?? 0, 3),
        spreadDeltaHome: round(weather?.spreadDeltaHome ?? 0, 3),
        uncertaintyPenalty: round(weather?.uncertaintyPenalty ?? 0, 3)
      },
      summaries: {
        homeOffenseWeighted: round(homeOffenseWeighted, 3),
        awayOffenseWeighted: round(awayOffenseWeighted, 3),
        homeDefenseWeighted: round(homeDefenseWeighted, 3),
        awayDefenseWeighted: round(awayDefenseWeighted, 3),
        paceWeighted: round(paceWeighted, 3)
      }
    }
  };
}
