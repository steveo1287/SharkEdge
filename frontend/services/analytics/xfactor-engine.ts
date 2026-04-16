import type {
  AnalyticsFactor,
  MatchupProfile,
  RatingsContext,
  SimulationEnhancementReport
} from "@/lib/types/analytics";
import { buildWeatherBlend, type WeatherBlendInput } from "@/services/analytics/weather-model-service";

export type XFactorInput = {
  sport: string;
  eventId: string;
  weather: WeatherBlendInput;
  offenseVsDefenseGap?: number | null;
  tempoGap?: number | null;
  styleClash?: number | null;
  travelFatigueAway?: number | null;
  travelFatigueHome?: number | null;
  playerMatchups?: Array<{
    player: string;
    opponent: string;
    edge: number;
    reason: string;
  }>;
  ratings?: {
    teamOverall?: number | null;
    teamOffense?: number | null;
    teamDefense?: number | null;
    starPowerIndex?: number | null;
    depthIndex?: number | null;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function buildFactor(
  key: string,
  label: string,
  category: AnalyticsFactor["category"],
  value: number,
  weight: number,
  detail: string,
  source: string
): AnalyticsFactor {
  const impactScore = round(value * weight);
  return {
    key,
    label,
    category,
    value: round(value),
    direction: value > 0.02 ? "positive" : value < -0.02 ? "negative" : "neutral",
    weight: round(weight),
    impactScore,
    confidence: clamp(0.55 + Math.abs(impactScore) * 0.8, 0.5, 0.95),
    detail,
    source
  };
}

export function buildSimulationEnhancementReport(input: XFactorInput): SimulationEnhancementReport {
  const environment = buildWeatherBlend(input.weather);
  const matchup: MatchupProfile = {
    teamVsTeam: {
      offensiveEfficiencyGap: input.offenseVsDefenseGap ?? null,
      defensiveResistanceGap: input.offenseVsDefenseGap !== null && input.offenseVsDefenseGap !== undefined ? -input.offenseVsDefenseGap : null,
      reboundingGap: null,
      turnoverGap: null,
      shotQualityGap: null,
      specialTeamsGap: null
    },
    styleVsStyle: {
      paceClash: input.tempoGap ?? null,
      rimAndThreePressure: null,
      isoVsSwitch: null,
      transitionEdge: input.styleClash ?? null,
      trenchMismatch: null,
      groundGameEdge: null
    },
    playerVsPlayer: input.playerMatchups ?? []
  };

  const ratings: RatingsContext = {
    videoGameRatingsAvailable: Boolean(input.ratings),
    teamOverall: input.ratings?.teamOverall ?? null,
    teamOffense: input.ratings?.teamOffense ?? null,
    teamDefense: input.ratings?.teamDefense ?? null,
    starPowerIndex: input.ratings?.starPowerIndex ?? null,
    depthIndex: input.ratings?.depthIndex ?? null,
    notes: input.ratings ? ["Ratings blended as weak prior, not primary driver."] : []
  };

  const factors: AnalyticsFactor[] = [
    buildFactor(
      "weather_scoring_environment",
      "Weather scoring environment",
      "weather",
      environment.weatherBlend.scoringEnvironmentDelta,
      0.7,
      environment.weatherBlend.summary,
      "windy/openmeteo/noaa blend placeholder"
    ),
    buildFactor(
      "tempo_gap",
      "Tempo clash",
      "tempo",
      input.tempoGap ?? 0,
      0.62,
      "Derived from possession/play volume mismatch.",
      "team pace profile"
    ),
    buildFactor(
      "offense_defense_gap",
      "Offense vs defense gap",
      "matchup",
      input.offenseVsDefenseGap ?? 0,
      0.95,
      "Opponent-adjusted efficiency gap.",
      "advanced team metrics"
    ),
    buildFactor(
      "style_clash",
      "Style versus style",
      "style",
      input.styleClash ?? 0,
      0.54,
      "Play-style conflict and schematic fit.",
      "style engine"
    ),
    buildFactor(
      "travel_fatigue_away",
      "Away travel fatigue",
      "travel",
      -(input.travelFatigueAway ?? 0),
      0.5,
      "Travel burden applied against away side.",
      "travel/circadian model"
    ),
    buildFactor(
      "ratings_prior",
      "Ratings prior",
      "ratings",
      ((input.ratings?.teamOverall ?? 0) - 75) / 100,
      0.2,
      "Video game ratings only used as weak prior.",
      "ratings prior"
    )
  ];

  const confidence = round(
    clamp(
      0.52 +
        factors.reduce((sum, factor) => sum + Math.abs(factor.impactScore), 0) / Math.max(1, factors.length) * 0.35 +
        environment.weatherBlend.confidence * 0.15,
      0.45,
      0.96
    ),
    2
  );

  return {
    sport: input.sport,
    eventId: input.eventId,
    generatedAt: new Date().toISOString(),
    modelVersion: "xfactor-v1",
    factors,
    environment,
    matchup,
    ratings,
    confidence,
    notes: [
      "This layer is an additive enhancement report intended to sit beside the existing simulation engine.",
      "Ratings inputs are weak-prior only and should never dominate market, performance, or injury data."
    ]
  };
}
