
import type { WeatherProviderDefinition, WeatherProviderKey } from "@/services/weather/provider-types";

const WEATHER_PROVIDERS: WeatherProviderDefinition[] = [
  {
    key: "METAR",
    label: "METAR/ASOS",
    roles: ["OBSERVATION", "SETTLEMENT"],
    priority: 100,
    note: "Best for observed station truth and operational airport weather."
  },
  {
    key: "NWS",
    label: "NWS/NOAA",
    roles: ["FORECAST", "SETTLEMENT"],
    priority: 96,
    note: "Strong official forecast and public-weather baseline."
  },
  {
    key: "HRRR",
    label: "HRRR",
    roles: ["FORECAST"],
    priority: 94,
    note: "High-resolution short-horizon forecast layer for near-start windows."
  },
  {
    key: "WINDY",
    label: "Windy",
    roles: ["VISUALIZATION", "FORECAST"],
    priority: 72,
    note: "Excellent model-comparison and map surface; better as a visualization/secondary layer than sole truth source."
  }
];

export function listWeatherProviders() {
  return WEATHER_PROVIDERS;
}

export function getWeatherProvider(key: WeatherProviderKey) {
  return WEATHER_PROVIDERS.find((provider) => provider.key === key) ?? null;
}
