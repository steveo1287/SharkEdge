export type MlbVenueWeather = {
  teamName: string;
  stadium: string;
  latitude: number;
  longitude: number;
  temperatureF: number;
  windMph: number;
  windDirection: "in" | "out" | "cross" | "unknown";
  humidityPct: number;
  precipitationRisk: number;
  weatherRunFactor: number;
  weatherVolatility: number;
};

const VENUES: Record<string, { stadium: string; lat: number; lon: number; orientation: number }> = {
  "Arizona Diamondbacks": { stadium: "Chase Field", lat: 33.4455, lon: -112.0667, orientation: 25 },
  "Atlanta Braves": { stadium: "Truist Park", lat: 33.8908, lon: -84.4678, orientation: 45 },
  "Baltimore Orioles": { stadium: "Oriole Park at Camden Yards", lat: 39.2839, lon: -76.6217, orientation: 35 },
  "Boston Red Sox": { stadium: "Fenway Park", lat: 42.3467, lon: -71.0972, orientation: 45 },
  "Chicago Cubs": { stadium: "Wrigley Field", lat: 41.9484, lon: -87.6553, orientation: 45 },
  "Chicago White Sox": { stadium: "Guaranteed Rate Field", lat: 41.83, lon: -87.6339, orientation: 30 },
  "Cincinnati Reds": { stadium: "Great American Ball Park", lat: 39.0979, lon: -84.5082, orientation: 60 },
  "Cleveland Guardians": { stadium: "Progressive Field", lat: 41.4962, lon: -81.6852, orientation: 40 },
  "Colorado Rockies": { stadium: "Coors Field", lat: 39.7559, lon: -104.9942, orientation: 20 },
  "Detroit Tigers": { stadium: "Comerica Park", lat: 42.339, lon: -83.0485, orientation: 35 },
  "Houston Astros": { stadium: "Minute Maid Park", lat: 29.7573, lon: -95.3555, orientation: 55 },
  "Kansas City Royals": { stadium: "Kauffman Stadium", lat: 39.0517, lon: -94.4803, orientation: 55 },
  "Los Angeles Angels": { stadium: "Angel Stadium", lat: 33.8003, lon: -117.8827, orientation: 55 },
  "Los Angeles Dodgers": { stadium: "Dodger Stadium", lat: 34.0739, lon: -118.24, orientation: 35 },
  "Miami Marlins": { stadium: "loanDepot park", lat: 25.7781, lon: -80.2197, orientation: 50 },
  "Milwaukee Brewers": { stadium: "American Family Field", lat: 43.028, lon: -87.9712, orientation: 45 },
  "Minnesota Twins": { stadium: "Target Field", lat: 44.9817, lon: -93.2776, orientation: 35 },
  "New York Mets": { stadium: "Citi Field", lat: 40.7571, lon: -73.8458, orientation: 45 },
  "New York Yankees": { stadium: "Yankee Stadium", lat: 40.8296, lon: -73.9262, orientation: 60 },
  "Oakland Athletics": { stadium: "Sutter Health Park", lat: 38.5804, lon: -121.5135, orientation: 40 },
  "Philadelphia Phillies": { stadium: "Citizens Bank Park", lat: 39.9061, lon: -75.1665, orientation: 55 },
  "Pittsburgh Pirates": { stadium: "PNC Park", lat: 40.4469, lon: -80.0057, orientation: 35 },
  "San Diego Padres": { stadium: "Petco Park", lat: 32.7073, lon: -117.1566, orientation: 40 },
  "San Francisco Giants": { stadium: "Oracle Park", lat: 37.7786, lon: -122.3893, orientation: 70 },
  "Seattle Mariners": { stadium: "T-Mobile Park", lat: 47.5914, lon: -122.3325, orientation: 40 },
  "St. Louis Cardinals": { stadium: "Busch Stadium", lat: 38.6226, lon: -90.1928, orientation: 45 },
  "Tampa Bay Rays": { stadium: "Tropicana Field", lat: 27.7682, lon: -82.6534, orientation: 0 },
  "Texas Rangers": { stadium: "Globe Life Field", lat: 32.7473, lon: -97.0842, orientation: 55 },
  "Toronto Blue Jays": { stadium: "Rogers Centre", lat: 43.6414, lon: -79.3894, orientation: 50 },
  "Washington Nationals": { stadium: "Nationals Park", lat: 38.873, lon: -77.0074, orientation: 45 }
};

function nearest(values: any[], index = 0) { return Array.isArray(values) ? values[index] : undefined; }
function normalizeName(teamName: string) { return Object.keys(VENUES).find((name) => name.toLowerCase() === teamName.toLowerCase()) ?? teamName; }
function windDirClass(deg: number, fieldOrientation: number): MlbVenueWeather["windDirection"] { if (!Number.isFinite(deg)) return "unknown"; const diff = Math.abs((((deg - fieldOrientation) % 360) + 540) % 360 - 180); if (diff <= 45) return "out"; if (diff >= 135) return "in"; return "cross"; }
function runFactor(temp: number, windMph: number, direction: MlbVenueWeather["windDirection"], humidity: number, precip: number) { const wind = direction === "out" ? windMph * 0.012 : direction === "in" ? -windMph * 0.011 : windMph * 0.002; const tempAdj = (temp - 70) * 0.0045; const humidityAdj = (humidity - 50) * 0.0012; const rainAdj = precip > 40 ? -0.04 : 0; return Number(Math.max(0.82, Math.min(1.22, 1 + wind + tempAdj + humidityAdj + rainAdj)).toFixed(3)); }

export async function getOpenMeteoVenueWeather(teamName: string): Promise<MlbVenueWeather | null> {
  const canonical = normalizeName(teamName);
  const venue = VENUES[canonical];
  if (!venue) return null;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(venue.lat));
  url.searchParams.set("longitude", String(venue.lon));
  url.searchParams.set("current", "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) return null;
  const body = await response.json();
  const current = body.current ?? {};
  const temperatureF = Number(current.temperature_2m ?? 70);
  const windMph = Number(current.wind_speed_10m ?? 0);
  const humidityPct = Number(current.relative_humidity_2m ?? 50);
  const precipitationRisk = Number(current.precipitation ?? 0) > 0 ? 60 : 10;
  const windDirection = windDirClass(Number(current.wind_direction_10m ?? NaN), venue.orientation);
  const weatherRunFactor = runFactor(temperatureF, windMph, windDirection, humidityPct, precipitationRisk);
  return { teamName: canonical, stadium: venue.stadium, latitude: venue.lat, longitude: venue.lon, temperatureF, windMph, windDirection, humidityPct, precipitationRisk, weatherRunFactor, weatherVolatility: Number(Math.max(0.05, Math.min(0.9, Math.abs(weatherRunFactor - 1) * 3 + windMph / 40 + precipitationRisk / 200)).toFixed(2)) };
}

export function getKnownMlbVenueTeams() { return Object.keys(VENUES); }
