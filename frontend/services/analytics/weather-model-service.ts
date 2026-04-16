import type { EnvironmentalContext, WeatherSignal } from "@/lib/types/analytics";

type ForecastProvider = {
  provider: string;
  model: string;
  temperatureF?: number | null;
  feelsLikeF?: number | null;
  windMph?: number | null;
  windDirection?: string | null;
  gustMph?: number | null;
  humidityPct?: number | null;
  pressureMb?: number | null;
  precipitationProbabilityPct?: number | null;
  precipitationIntensityMm?: number | null;
  cloudCoverPct?: number | null;
  confidence?: number | null;
  notes?: string[];
};

export type WeatherBlendInput = {
  indoor?: boolean | null;
  surface?: string | null;
  altitudeFt?: number | null;
  travelMilesHome?: number | null;
  travelMilesAway?: number | null;
  circadianPenaltyHome?: number | null;
  circadianPenaltyAway?: number | null;
  providers: ForecastProvider[];
};

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWeatherSignal(input: ForecastProvider): WeatherSignal {
  return {
    provider: input.provider,
    model: input.model,
    temperatureF: input.temperatureF ?? null,
    feelsLikeF: input.feelsLikeF ?? null,
    windMph: input.windMph ?? null,
    windDirection: input.windDirection ?? null,
    gustMph: input.gustMph ?? null,
    humidityPct: input.humidityPct ?? null,
    pressureMb: input.pressureMb ?? null,
    precipitationProbabilityPct: input.precipitationProbabilityPct ?? null,
    precipitationIntensityMm: input.precipitationIntensityMm ?? null,
    cloudCoverPct: input.cloudCoverPct ?? null,
    roofOpenImpact: false,
    notes: input.notes ?? [],
    confidence: clamp(input.confidence ?? 0.58, 0, 1)
  };
}

export function buildWeatherBlend(input: WeatherBlendInput): EnvironmentalContext {
  const signals = input.providers.map(normalizeWeatherSignal);
  const wind = average(signals.map((item) => item.windMph).filter((value): value is number => typeof value === "number")) ?? 0;
  const gust = average(signals.map((item) => item.gustMph).filter((value): value is number => typeof value === "number")) ?? 0;
  const precipitation = average(
    signals
      .map((item) => item.precipitationProbabilityPct)
      .filter((value): value is number => typeof value === "number")
  ) ?? 0;
  const humidity = average(signals.map((item) => item.humidityPct).filter((value): value is number => typeof value === "number")) ?? 0;
  const temperature = average(signals.map((item) => item.temperatureF).filter((value): value is number => typeof value === "number")) ?? 70;
  const confidence = average(signals.map((item) => item.confidence)) ?? 0.55;

  const outdoorWeatherPenalty = input.indoor ? 0 : clamp((precipitation / 100) * 0.12 + wind * 0.006 + gust * 0.003, -0.2, 0.26);
  const heatPenalty = input.indoor ? 0 : clamp(Math.abs(temperature - 68) / 100, 0, 0.18);
  const altitudeBoost = clamp((input.altitudeFt ?? 0) / 8000, 0, 0.2);

  const scoringEnvironmentDelta = round(altitudeBoost - outdoorWeatherPenalty - heatPenalty * 0.4);
  const runEnvironmentDelta = round(altitudeBoost * 0.9 - outdoorWeatherPenalty * 0.8);
  const paceDelta = round(-(outdoorWeatherPenalty * 0.7) - heatPenalty * 0.25);
  const passingDelta = round(-(wind * 0.01) - (precipitation / 100) * 0.08);
  const kickingDelta = round(-(wind * 0.016) - (precipitation / 100) * 0.05 + altitudeBoost * 0.3);

  return {
    weather: signals,
    weatherBlend: {
      runEnvironmentDelta,
      scoringEnvironmentDelta,
      paceDelta,
      passingDelta,
      kickingDelta,
      confidence: round(confidence, 2),
      summary: input.indoor
        ? "Indoor venue suppresses most direct weather effects."
        : "Blended weather impact from multiple forecast models."
    },
    altitudeFt: input.altitudeFt ?? null,
    surface: input.surface ?? null,
    indoor: input.indoor ?? null,
    travelMilesHome: input.travelMilesHome ?? null,
    travelMilesAway: input.travelMilesAway ?? null,
    circadianPenaltyHome: input.circadianPenaltyHome ?? null,
    circadianPenaltyAway: input.circadianPenaltyAway ?? null
  };
}
