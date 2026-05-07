import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

type RoofType = "open" | "retractable" | "dome";

type MlbVenue = {
  teamKey: string;
  name: string;
  lat: number;
  lon: number;
  roofType: RoofType;
  // 0 = no wind effect, 1 = full wind sensitivity (open air, shallow fences, etc.)
  windSensitivity: number;
};

const VENUES: MlbVenue[] = [
  { teamKey: "arizonadiamondbacks",   name: "Chase Field",                   lat: 33.4453, lon: -112.0667, roofType: "retractable", windSensitivity: 0.3 },
  { teamKey: "atlantabraves",         name: "Truist Park",                   lat: 33.8908, lon: -84.4678,  roofType: "open",        windSensitivity: 0.7 },
  { teamKey: "baltimoreorioles",      name: "Camden Yards",                  lat: 39.2838, lon: -76.6218,  roofType: "open",        windSensitivity: 0.75 },
  { teamKey: "bostonredsox",          name: "Fenway Park",                   lat: 42.3467, lon: -71.0972,  roofType: "open",        windSensitivity: 0.85 },
  { teamKey: "chicagocubs",           name: "Wrigley Field",                 lat: 41.9484, lon: -87.6553,  roofType: "open",        windSensitivity: 1.0  },
  { teamKey: "chicagowhitesox",       name: "Guaranteed Rate Field",         lat: 41.8300, lon: -87.6339,  roofType: "open",        windSensitivity: 0.8  },
  { teamKey: "cincinnatiredss",       name: "Great American Ball Park",      lat: 39.0974, lon: -84.5067,  roofType: "open",        windSensitivity: 0.8  },
  { teamKey: "clevelandguardians",    name: "Progressive Field",             lat: 41.4962, lon: -81.6852,  roofType: "open",        windSensitivity: 0.75 },
  { teamKey: "coloradorockies",       name: "Coors Field",                   lat: 39.7559, lon: -104.9942, roofType: "open",        windSensitivity: 0.9  },
  { teamKey: "detroittigers",         name: "Comerica Park",                 lat: 42.3390, lon: -83.0485,  roofType: "open",        windSensitivity: 0.7  },
  { teamKey: "houstonastroas",        name: "Minute Maid Park",              lat: 29.7572, lon: -95.3555,  roofType: "retractable", windSensitivity: 0.25 },
  { teamKey: "kansascityroyals",      name: "Kauffman Stadium",              lat: 39.0517, lon: -94.4803,  roofType: "open",        windSensitivity: 0.85 },
  { teamKey: "losangelesangels",      name: "Angel Stadium",                 lat: 33.8003, lon: -117.8827, roofType: "open",        windSensitivity: 0.6  },
  { teamKey: "losangelesdodgers",     name: "Dodger Stadium",                lat: 34.0739, lon: -118.2400, roofType: "open",        windSensitivity: 0.65 },
  { teamKey: "miamimarlins",          name: "loanDepot park",                lat: 25.7781, lon: -80.2197,  roofType: "retractable", windSensitivity: 0.2  },
  { teamKey: "milwaukeebrewers",      name: "American Family Field",         lat: 43.0280, lon: -87.9712,  roofType: "retractable", windSensitivity: 0.3  },
  { teamKey: "minnesotatwins",        name: "Target Field",                  lat: 44.9817, lon: -93.2781,  roofType: "open",        windSensitivity: 0.8  },
  { teamKey: "newyorkmets",           name: "Citi Field",                    lat: 40.7571, lon: -73.8458,  roofType: "open",        windSensitivity: 0.8  },
  { teamKey: "newyorkyankees",        name: "Yankee Stadium",                lat: 40.8296, lon: -73.9262,  roofType: "open",        windSensitivity: 0.75 },
  { teamKey: "oaklandathletics",      name: "Sutter Health Park",            lat: 38.5780, lon: -121.5085, roofType: "open",        windSensitivity: 0.7  },
  { teamKey: "philadelphiaphillies",  name: "Citizens Bank Park",            lat: 39.9057, lon: -75.1665,  roofType: "open",        windSensitivity: 0.8  },
  { teamKey: "pittsburghpirates",     name: "PNC Park",                      lat: 40.4469, lon: -80.0057,  roofType: "open",        windSensitivity: 0.75 },
  { teamKey: "sandiegopadres",        name: "Petco Park",                    lat: 32.7076, lon: -117.1570, roofType: "open",        windSensitivity: 0.55 },
  { teamKey: "sanfranciscogaints",    name: "Oracle Park",                   lat: 37.7786, lon: -122.3893, roofType: "open",        windSensitivity: 0.9  },
  { teamKey: "seattlemariners",       name: "T-Mobile Park",                 lat: 47.5914, lon: -122.3325, roofType: "retractable", windSensitivity: 0.25 },
  { teamKey: "stlouiscardinals",      name: "Busch Stadium",                 lat: 38.6226, lon: -90.1928,  roofType: "open",        windSensitivity: 0.8  },
  { teamKey: "tampabayarys",          name: "Tropicana Field",               lat: 27.7683, lon: -82.6534,  roofType: "dome",        windSensitivity: 0.0  },
  { teamKey: "texasrangers",          name: "Globe Life Field",              lat: 32.7512, lon: -97.0832,  roofType: "retractable", windSensitivity: 0.2  },
  { teamKey: "torontobluejays",       name: "Rogers Centre",                 lat: 43.6414, lon: -79.3894,  roofType: "retractable", windSensitivity: 0.2  },
  { teamKey: "washingtonnationals",   name: "Nationals Park",                lat: 38.8730, lon: -77.0074,  roofType: "open",        windSensitivity: 0.75 },
];

export type MlbWeatherForecast = {
  venueKey: string;
  venueName: string;
  roofType: RoofType;
  tempF: number;
  windSpeedMph: number;
  windDirDeg: number;
  precipitationMm: number;
  weatherRunFactor: number;
  source: "open-meteo" | "synthetic";
};

function cToF(c: number) { return c * 9 / 5 + 32; }
function msToMph(ms: number) { return ms * 2.237; }

// Wind direction: 0/360 = N (blowing south = into CF at most parks), 180 = S (blowing north = out to CF at most parks).
// CF orientation is roughly NNW-SSE at most parks so blowing-out ~= 150-210 deg.
// Returns [-1, 1] where +1 = directly out, -1 = directly in.
function windOutFactor(deg: number): number {
  const normalized = ((deg % 360) + 360) % 360;
  // peak out = 180 deg, peak in = 0/360 deg
  return Math.cos(((normalized - 180) * Math.PI) / 180);
}

function deriveWeatherRunFactor(forecast: Omit<MlbWeatherForecast, "weatherRunFactor" | "source">, windSensitivity: number): number {
  if (forecast.roofType === "dome") return 1.0;

  // Temperature effect: cold suppresses runs, heat slightly boosts (ball carries farther)
  // League average ~72°F → neutral. Below 50 = meaningful suppression, above 85 = slight boost.
  const tempEffect = Math.max(-0.12, Math.min(0.08, (forecast.tempF - 72) * 0.0025));

  // Wind effect: speed × direction × sensitivity
  const windMph = Math.min(forecast.windSpeedMph, 35);
  const windDirection = windOutFactor(forecast.windDirDeg);
  const rawWindEffect = (windMph / 20) * windDirection * 0.12 * windSensitivity;
  const windEffect = Math.max(-0.14, Math.min(0.14, rawWindEffect));

  // Precipitation dampens offense (wet ball, slower field)
  const precipEffect = forecast.precipitationMm > 0 ? Math.max(-0.06, -(forecast.precipitationMm / 8) * 0.06) : 0;

  const factor = 1 + tempEffect + windEffect + precipEffect;
  return Number(Math.max(0.82, Math.min(1.2, factor)).toFixed(3));
}

function buildCacheKey(venueKey: string, gameHour: number) {
  return `mlb:weather:${venueKey}:${gameHour}`;
}

async function fetchOpenMeteoForecast(venue: MlbVenue, gameTime: Date): Promise<MlbWeatherForecast> {
  const gameHour = Math.floor(gameTime.getTime() / (1000 * 3600));
  const cacheKey = buildCacheKey(venue.teamKey, gameHour);
  const cached = await readHotCache<MlbWeatherForecast>(cacheKey);
  if (cached) return cached;

  const dateStr = gameTime.toISOString().split("T")[0];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${venue.lat}&longitude=${venue.lon}&hourly=temperature_2m,windspeed_10m,winddirection_10m,precipitation&temperature_unit=celsius&windspeed_unit=ms&start_date=${dateStr}&end_date=${dateStr}&timezone=UTC&forecast_days=1`;

  const targetHour = gameTime.getUTCHours();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(`Open-Meteo ${response.status}`);
    const data = await response.json() as {
      hourly: {
        time: string[];
        temperature_2m: number[];
        windspeed_10m: number[];
        winddirection_10m: number[];
        precipitation: number[];
      };
    };

    const idx = data.hourly.time.findIndex((t) => new Date(t + "Z").getUTCHours() === targetHour);
    const slot = idx >= 0 ? idx : Math.min(Math.max(0, Math.round(targetHour / 24 * (data.hourly.time.length - 1))), data.hourly.time.length - 1);

    const tempF = cToF(data.hourly.temperature_2m[slot] ?? 20);
    const windSpeedMph = msToMph(data.hourly.windspeed_10m[slot] ?? 0);
    const windDirDeg = data.hourly.winddirection_10m[slot] ?? 180;
    const precipitationMm = data.hourly.precipitation[slot] ?? 0;

    const base = { venueKey: venue.teamKey, venueName: venue.name, roofType: venue.roofType, tempF, windSpeedMph, windDirDeg, precipitationMm };
    const weatherRunFactor = deriveWeatherRunFactor(base, venue.windSensitivity);
    const result: MlbWeatherForecast = { ...base, weatherRunFactor, source: "open-meteo" };
    await writeHotCache(cacheKey, result, 1800);
    return result;
  } catch {
    return syntheticForecast(venue);
  }
}

function syntheticForecast(venue: MlbVenue): MlbWeatherForecast {
  const base = { venueKey: venue.teamKey, venueName: venue.name, roofType: venue.roofType, tempF: 72, windSpeedMph: 6, windDirDeg: 180, precipitationMm: 0 };
  return { ...base, weatherRunFactor: deriveWeatherRunFactor(base, venue.windSensitivity), source: "synthetic" };
}

function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export async function getMlbGameWeather(homeTeamName: string, gameStartTime: string): Promise<MlbWeatherForecast> {
  const key = normalizeKey(homeTeamName);
  const venue = VENUES.find((v) => v.teamKey === key || key.includes(normalizeKey(v.teamKey.replace(/\d/g, ""))) || normalizeKey(v.teamKey.replace(/\d/g, "")).includes(key));
  if (!venue) return { venueKey: key, venueName: homeTeamName, roofType: "open", tempF: 72, windSpeedMph: 6, windDirDeg: 180, precipitationMm: 0, weatherRunFactor: 1.0, source: "synthetic" };

  if (venue.roofType === "dome") return { ...syntheticForecast(venue), weatherRunFactor: 1.0 };

  const gameTime = new Date(gameStartTime);
  if (isNaN(gameTime.getTime())) return syntheticForecast(venue);

  return fetchOpenMeteoForecast(venue, gameTime);
}
