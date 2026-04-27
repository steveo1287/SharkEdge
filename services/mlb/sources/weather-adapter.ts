type WeatherResult = {
  windOut: number;
  runBoost: number;
};

const TEAM_COORDS: Record<string, { lat: number; lon: number }> = {
  CHC: { lat: 41.9484, lon: -87.6553 },
  STL: { lat: 38.6226, lon: -90.1928 },
  NYY: { lat: 40.8296, lon: -73.9262 },
  LAD: { lat: 34.0739, lon: -118.24 }
};

function tempFactor(temp: number) {
  if (temp >= 85) return 1.08;
  if (temp >= 75) return 1.04;
  if (temp <= 50) return 0.95;
  return 1;
}

function windFactor(speed: number) {
  if (speed >= 15) return 1.08;
  if (speed >= 10) return 1.04;
  return 1;
}

export async function fetchWeather(team?: string): Promise<WeatherResult> {
  const coords = team ? TEAM_COORDS[team.toUpperCase()] : null;
  if (!coords) return { windOut: 1, runBoost: 1 };

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,wind_speed_10m`;
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    const temp = json?.current?.temperature_2m ?? 70;
    const wind = json?.current?.wind_speed_10m ?? 5;

    return {
      windOut: windFactor(wind),
      runBoost: tempFactor(temp)
    };
  } catch {
    return { windOut: 1, runBoost: 1 };
  }
}
