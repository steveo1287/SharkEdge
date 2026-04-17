export type WeatherSourceKey = "WINDY" | "MANUAL" | "UNKNOWN";

export type WeatherSnapshotInput = {
  source?: string | null;
  tempF?: number | null;
  windMph?: number | null;
  windDirection?: string | null;
  precipitationProbability?: number | null;
  humidity?: number | null;
  altitudeFeet?: number | null;
  roofStatus?: string | null;
  indoorOverride?: boolean | null;
};

export type WeatherAdjustment = {
  available: boolean;
  isIndoor: boolean;
  source: WeatherSourceKey;
  scoreFactor: number;
  totalDelta: number;
  spreadDeltaHome: number;
  volatilityDelta: number;
  uncertaintyPenalty: number;
  note: string;
  diagnostics: {
    tempF: number | null;
    windMph: number | null;
    precipitationProbability: number | null;
    humidity: number | null;
    altitudeFeet: number | null;
    roofStatus: string | null;
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 3) {
  return Number(value.toFixed(digits));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function inferIndoorFromVenue(sportKey: string, venueName: string | null | undefined) {
  if (sportKey === "UFC" || sportKey === "BOXING" || sportKey === "NBA" || sportKey === "NCAAB" || sportKey === "NHL") {
    return true;
  }
  const normalized = normalize(venueName);
  if (!normalized) {
    return false;
  }
  if (
    normalized.includes("arena") ||
    normalized.includes("center") ||
    normalized.includes("centre") ||
    normalized.includes("garden") ||
    normalized.includes("pavilion") ||
    normalized.includes("fieldhouse")
  ) {
    return true;
  }
  if (
    normalized.includes("stadium") ||
    normalized.includes("field") ||
    normalized.includes("park") ||
    normalized.includes("speedway")
  ) {
    return false;
  }
  return false;
}

function resolveSource(source?: string | null): WeatherSourceKey {
  const normalized = normalize(source);
  if (normalized.includes("windy")) {
    return "WINDY";
  }
  if (normalized) {
    return "MANUAL";
  }
  return "UNKNOWN";
}

export function resolveWeatherAdjustment(args: {
  sportKey: string;
  venueName: string | null;
  weather?: WeatherSnapshotInput | null;
}) : WeatherAdjustment {
  const weather = args.weather ?? null;
  const source = resolveSource(weather?.source);
  const roofStatus = normalize(weather?.roofStatus);
  const isIndoor =
    typeof weather?.indoorOverride === "boolean"
      ? weather.indoorOverride
      : roofStatus === "closed" || roofStatus === "indoor"
        ? true
        : roofStatus === "open" || roofStatus === "outdoor"
          ? false
          : inferIndoorFromVenue(args.sportKey, args.venueName);

  const tempF = typeof weather?.tempF === "number" ? weather.tempF : null;
  const windMph = typeof weather?.windMph === "number" ? weather.windMph : null;
  const precipitationProbability =
    typeof weather?.precipitationProbability === "number" ? weather.precipitationProbability : null;
  const humidity = typeof weather?.humidity === "number" ? weather.humidity : null;
  const altitudeFeet = typeof weather?.altitudeFeet === "number" ? weather.altitudeFeet : null;

  if (isIndoor) {
    return {
      available: Boolean(weather),
      isIndoor: true,
      source,
      scoreFactor: 1,
      totalDelta: 0,
      spreadDeltaHome: 0,
      volatilityDelta: 0,
      uncertaintyPenalty: 0,
      note: weather ? "Indoor venue neutralizes live weather exposure." : "Indoor venue assumed weather-neutral.",
      diagnostics: { tempF, windMph, precipitationProbability, humidity, altitudeFeet, roofStatus: weather?.roofStatus ?? null }
    };
  }

  const hasWeather = Boolean(weather) && [tempF, windMph, precipitationProbability, humidity, altitudeFeet].some((value) => value !== null);

  let scoreFactor = 1;
  let totalDelta = 0;
  let spreadDeltaHome = 0;
  let volatilityDelta = 0;
  let uncertaintyPenalty = hasWeather ? 0 : 12;
  const notes: string[] = [];

  if (!hasWeather) {
    notes.push("Outdoor weather unavailable; confidence is reduced until a live snapshot is wired.");
  }

  if (typeof windMph === "number") {
    if (args.sportKey === "NFL" || args.sportKey === "NCAAF") {
      totalDelta -= clamp((windMph - 10) * 0.22, 0, 6.5);
      scoreFactor *= 1 - clamp((windMph - 12) * 0.006, 0, 0.1);
      volatilityDelta += clamp((windMph - 14) * 0.25, 0, 8);
      notes.push(`Wind ${windMph.toFixed(0)} mph suppresses passing efficiency and deep-ball stability.`);
    } else if (args.sportKey === "MLB") {
      totalDelta += clamp((windMph - 8) * 0.08, -1.2, 1.8);
      scoreFactor *= 1 + clamp((windMph - 8) * 0.003, -0.03, 0.05);
      notes.push(`Wind ${windMph.toFixed(0)} mph can materially swing carry and run environment.`);
    }
  }

  if (typeof tempF === "number") {
    if (args.sportKey === "NFL" || args.sportKey === "NCAAF") {
      if (tempF <= 28) {
        totalDelta -= clamp((32 - tempF) * 0.08, 0, 2.4);
        notes.push(`Cold temperature (${tempF.toFixed(0)}F) reduces explosive efficiency.`);
      } else if (tempF >= 82) {
        volatilityDelta += clamp((tempF - 82) * 0.1, 0, 3.5);
      }
    }
    if (args.sportKey === "MLB") {
      totalDelta += clamp((tempF - 68) * 0.03, -0.9, 1.2);
    }
  }

  if (typeof precipitationProbability === "number") {
    if (args.sportKey === "NFL" || args.sportKey === "NCAAF") {
      totalDelta -= clamp((precipitationProbability - 35) * 0.025, 0, 2.4);
      volatilityDelta += clamp((precipitationProbability - 45) * 0.04, 0, 5);
      notes.push(`Precipitation risk (${precipitationProbability.toFixed(0)}%) adds ball-security and footing volatility.`);
    } else if (args.sportKey === "MLB") {
      uncertaintyPenalty += clamp((precipitationProbability - 40) * 0.08, 0, 8);
    }
  }

  if (typeof altitudeFeet === "number" && args.sportKey === "NFL") {
    spreadDeltaHome += clamp((altitudeFeet - 2500) / 2500, 0, 1.2);
    if (altitudeFeet > 2500) {
      notes.push(`Altitude (${altitudeFeet.toFixed(0)} ft) gives the home side a late-conditioning edge.`);
    }
  }

  uncertaintyPenalty += hasWeather ? clamp(volatilityDelta * 0.8, 0, 10) : 0;

  return {
    available: hasWeather,
    isIndoor: false,
    source,
    scoreFactor: round(clamp(scoreFactor, 0.88, 1.12), 4),
    totalDelta: round(totalDelta, 3),
    spreadDeltaHome: round(spreadDeltaHome, 3),
    volatilityDelta: round(volatilityDelta, 3),
    uncertaintyPenalty: round(clamp(uncertaintyPenalty, 0, 24), 3),
    note: notes.join(" ") || (hasWeather ? "Weather snapshot loaded." : "Weather snapshot missing."),
    diagnostics: {
      tempF,
      windMph,
      precipitationProbability,
      humidity,
      altitudeFeet,
      roofStatus: weather?.roofStatus ?? null
    }
  };
}
