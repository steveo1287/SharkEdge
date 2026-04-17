import type { Prisma } from "@prisma/client";

import { resolveWeatherAdjustment, type WeatherAdjustment, type WeatherSnapshotInput } from "@/services/modeling/weather-context";

export type WeatherFeatureView = {
  snapshot: WeatherSnapshotInput | null;
  adjustment: WeatherAdjustment;
  weatherBucket: string | null;
  altitudeBucket: string | null;
};

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function buildWeatherSnapshotFromEventMetadata(metadataJson: Prisma.JsonValue | null): WeatherSnapshotInput | null {
  const metadata = asRecord(metadataJson);
  if (!metadata) {
    return null;
  }
  const weatherRecord = asRecord((metadata.weather ?? null) as Prisma.JsonValue | null) ?? metadata;
  const snapshot: WeatherSnapshotInput = {
    source:
      typeof weatherRecord.source === "string"
        ? weatherRecord.source
        : typeof metadata.weatherSource === "string"
          ? metadata.weatherSource
          : null,
    tempF: coerceNumber(weatherRecord.tempF ?? weatherRecord.temperatureF ?? weatherRecord.temp),
    windMph: coerceNumber(weatherRecord.windMph ?? weatherRecord.wind_speed_mph ?? weatherRecord.wind),
    windDirection:
      typeof weatherRecord.windDirection === "string"
        ? weatherRecord.windDirection
        : typeof weatherRecord.windDir === "string"
          ? weatherRecord.windDir
          : null,
    precipitationProbability: coerceNumber(
      weatherRecord.precipitationProbability ?? weatherRecord.precipProbability ?? weatherRecord.rainChance
    ),
    humidity: coerceNumber(weatherRecord.humidity ?? weatherRecord.humidityPct),
    altitudeFeet: coerceNumber(weatherRecord.altitudeFeet ?? weatherRecord.altitude),
    roofStatus:
      typeof weatherRecord.roofStatus === "string"
        ? weatherRecord.roofStatus
        : typeof metadata.roofStatus === "string"
          ? metadata.roofStatus
          : null,
    indoorOverride:
      typeof weatherRecord.indoorOverride === "boolean"
        ? weatherRecord.indoorOverride
        : typeof metadata.isIndoor === "boolean"
          ? metadata.isIndoor
          : null
  };

  if (
    [snapshot.tempF, snapshot.windMph, snapshot.precipitationProbability, snapshot.humidity, snapshot.altitudeFeet].every(
      (value) => value === null || value === undefined
    ) &&
    !snapshot.source &&
    !snapshot.roofStatus &&
    snapshot.indoorOverride === null
  ) {
    return null;
  }

  return snapshot;
}

function getWeatherBucket(adjustment: WeatherAdjustment) {
  if (adjustment.isIndoor) return "indoor";
  const wind = adjustment.diagnostics.windMph ?? null;
  const precip = adjustment.diagnostics.precipitationProbability ?? null;
  const tempF = adjustment.diagnostics.tempF ?? null;

  if (!adjustment.available) return "outdoor_unknown";
  if (typeof precip === "number" && precip >= 60) return "wet";
  if (typeof wind === "number" && wind >= 20) return "windy";
  if (typeof tempF === "number" && tempF <= 35) return "cold";
  if (typeof tempF === "number" && tempF >= 85) return "hot";
  return "neutral_outdoor";
}

function getAltitudeBucket(altitudeFeet: number | null | undefined) {
  if (typeof altitudeFeet !== "number") return null;
  if (altitudeFeet < 1000) return "sea_level";
  if (altitudeFeet < 3000) return "elevated";
  return "high_altitude";
}

export function buildWeatherFeatureView(args: {
  sportKey: string;
  venueName: string | null;
  metadataJson: Prisma.JsonValue | null;
}) : WeatherFeatureView {
  const snapshot = buildWeatherSnapshotFromEventMetadata(args.metadataJson);
  const adjustment = resolveWeatherAdjustment({
    sportKey: args.sportKey,
    venueName: args.venueName,
    weather: snapshot
  });

  return {
    snapshot,
    adjustment,
    weatherBucket: getWeatherBucket(adjustment),
    altitudeBucket: getAltitudeBucket(adjustment.diagnostics.altitudeFeet)
  };
}
