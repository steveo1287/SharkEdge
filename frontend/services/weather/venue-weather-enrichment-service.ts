import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { buildWeatherFeatureView } from "@/services/modeling/weather-snapshot-warehouse";

export type VenueCoordinates = {
  lat: number;
  lon: number;
  source: "metadata" | "venue_map";
};

export type LiveWeatherSnapshot = {
  source: string;
  observedAt: string;
  tempF: number | null;
  windMph: number | null;
  windDirection: string | null;
  precipProbability: number | null;
  humidity: number | null;
  altitudeFeet: number | null;
  roofStatus: string | null;
};

const KNOWN_VENUE_COORDINATES: Record<string, { lat: number; lon: number }> = {
  "empower field at mile high": { lat: 39.7439, lon: -105.0201 },
  "arrowhead stadium": { lat: 39.0489, lon: -94.4839 },
  "lambeau field": { lat: 44.5013, lon: -88.0622 },
  "soldier field": { lat: 41.8623, lon: -87.6167 },
  "wrigley field": { lat: 41.9484, lon: -87.6553 },
  "fenway park": { lat: 42.3467, lon: -71.0972 },
  "coors field": { lat: 39.7561, lon: -104.9942 },
  "yankee stadium": { lat: 40.8296, lon: -73.9262 }
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

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

export function resolveVenueCoordinates(args: { venueName: string | null; metadataJson: Prisma.JsonValue | null }): VenueCoordinates | null {
  const metadata = asRecord(args.metadataJson);
  const venueRecord = asRecord((metadata?.venue ?? null) as Prisma.JsonValue | null);
  const metadataLat = coerceNumber(metadata?.venueLat ?? metadata?.lat ?? venueRecord?.lat);
  const metadataLon = coerceNumber(metadata?.venueLon ?? metadata?.lon ?? venueRecord?.lon);
  if (typeof metadataLat === "number" && typeof metadataLon === "number") {
    return { lat: metadataLat, lon: metadataLon, source: "metadata" };
  }
  const mapped = KNOWN_VENUE_COORDINATES[normalize(args.venueName)];
  return mapped ? { ...mapped, source: "venue_map" } : null;
}

export function mergeEventMetadataWithWeather(args: {
  metadataJson: Prisma.JsonValue | null;
  weather: LiveWeatherSnapshot;
  venueCoordinates?: VenueCoordinates | null;
}) {
  const metadata = asRecord(args.metadataJson) ?? {};
  return {
    ...metadata,
    venueLat: args.venueCoordinates?.lat ?? metadata.venueLat ?? null,
    venueLon: args.venueCoordinates?.lon ?? metadata.venueLon ?? null,
    weatherSource: args.weather.source,
    weather: {
      source: args.weather.source,
      observedAt: args.weather.observedAt,
      tempF: args.weather.tempF,
      windMph: args.weather.windMph,
      windDirection: args.weather.windDirection,
      precipProbability: args.weather.precipProbability,
      humidity: args.weather.humidity,
      altitudeFeet: args.weather.altitudeFeet,
      roofStatus: args.weather.roofStatus
    }
  } as Prisma.InputJsonValue;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "SharkEdgeWeatherWorker/1.0"
    }
  });
  if (!response.ok) {
    throw new Error(`Weather request failed: ${response.status}`);
  }
  return response.json() as Promise<any>;
}

function fillTemplate(template: string, coords: VenueCoordinates) {
  return template.replaceAll("{lat}", String(coords.lat)).replaceAll("{lon}", String(coords.lon));
}

async function fetchWindySnapshot(coords: VenueCoordinates): Promise<LiveWeatherSnapshot | null> {
  const template = process.env.SHARKEDGE_WINDY_POINT_FORECAST_URL_TEMPLATE?.trim();
  if (!template) return null;
  const payload = await fetchJson(fillTemplate(template, coords));
  const current = payload?.current ?? payload?.forecast ?? payload ?? {};
  return {
    source: "windy.com",
    observedAt: new Date().toISOString(),
    tempF: coerceNumber(current.tempF ?? current.temperatureF ?? current.temp),
    windMph: coerceNumber(current.windMph ?? current.wind_speed_mph ?? current.wind),
    windDirection: typeof current.windDirection === "string" ? current.windDirection : null,
    precipProbability: coerceNumber(current.precipProbability ?? current.rainChance),
    humidity: coerceNumber(current.humidity),
    altitudeFeet: coerceNumber(current.altitudeFeet),
    roofStatus: typeof current.roofStatus === "string" ? current.roofStatus : null
  };
}

async function fetchNwsSnapshot(coords: VenueCoordinates): Promise<LiveWeatherSnapshot | null> {
  const points = await fetchJson(`https://api.weather.gov/points/${coords.lat},${coords.lon}`);
  const hourlyUrl = points?.properties?.forecastHourly;
  if (typeof hourlyUrl !== "string") return null;
  const hourly = await fetchJson(hourlyUrl);
  const period = Array.isArray(hourly?.properties?.periods) ? hourly.properties.periods[0] : null;
  if (!period) return null;
  return {
    source: "nws",
    observedAt: new Date().toISOString(),
    tempF: coerceNumber(period.temperature),
    windMph: coerceNumber(typeof period.windSpeed === "string" ? period.windSpeed.split(" ")[0] : null),
    windDirection: typeof period.windDirection === "string" ? period.windDirection : null,
    precipProbability: coerceNumber(period.probabilityOfPrecipitation?.value),
    humidity: coerceNumber(period.relativeHumidity?.value),
    altitudeFeet: null,
    roofStatus: null
  };
}

export async function fetchVenueWeatherSnapshot(args: { venueName: string | null; metadataJson: Prisma.JsonValue | null }) {
  const coords = resolveVenueCoordinates(args);
  if (!coords) return null;
  const windy = await fetchWindySnapshot(coords).catch(() => null);
  if (windy) return { snapshot: windy, coordinates: coords };
  const nws = await fetchNwsSnapshot(coords).catch(() => null);
  if (nws) return { snapshot: nws, coordinates: coords };
  return null;
}

export async function refreshUpcomingEventWeatherSnapshots(args?: { eventIds?: string[]; leagues?: string[]; limit?: number }) {
  const leagues = args?.leagues?.length ? args.leagues : ["MLB", "NFL", "NCAAF"];
  const events = await prisma.event.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      league: { key: { in: leagues } },
      ...(args?.eventIds?.length ? { id: { in: args.eventIds } } : {})
    },
    include: { league: true },
    orderBy: { startTime: "asc" },
    take: args?.limit ?? 60
  });

  let updated = 0;
  let skipped = 0;
  const sampleBuckets: Array<string | null> = [];

  for (const event of events) {
    const fetched = await fetchVenueWeatherSnapshot({ venueName: event.venue ?? null, metadataJson: event.metadataJson });
    if (!fetched) {
      skipped += 1;
      continue;
    }
    const metadataJson = mergeEventMetadataWithWeather({
      metadataJson: event.metadataJson,
      weather: fetched.snapshot,
      venueCoordinates: fetched.coordinates
    });
    await prisma.event.update({ where: { id: event.id }, data: { metadataJson } });
    updated += 1;
    const weatherFeature = buildWeatherFeatureView({
      sportKey: event.league.key,
      venueName: event.venue ?? null,
      metadataJson
    });
    sampleBuckets.push(weatherFeature.weatherBucket);
  }

  return {
    eventsScanned: events.length,
    updated,
    skipped,
    sampleBuckets: sampleBuckets.slice(0, 8)
  };
}
