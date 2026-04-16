import type { MlbAdvancedGameContext } from "@/lib/types/mlb-advanced";

type LiveMlbVenue = {
  name: string;
  parkFactor: number;
  altitudeFt: number;
  lat: number;
  lon: number;
};

const venueCatalog: Record<string, LiveMlbVenue> = {
  default: {
    name: "Generic MLB Park",
    parkFactor: 1.03,
    altitudeFt: 600,
    lat: 41.8781,
    lon: -87.6298
  }
};

export async function fetchLiveMlbGameInputs(eventId: string): Promise<MlbAdvancedGameContext> {
  const venue = venueCatalog.default;

  return {
    eventId,
    homeStarterFip: 3.72,
    awayStarterFip: 4.09,
    probableHomeStarterHandedness: "R",
    probableAwayStarterHandedness: "L",
    homeLineupVsHandedness: [
      { handedness: "R", xwoba: 0.372, barrelRate: 0.094, strikeoutRate: 0.205 },
      { handedness: "L", xwoba: 0.359, barrelRate: 0.089, strikeoutRate: 0.216 }
    ],
    awayLineupVsHandedness: [
      { handedness: "R", xwoba: 0.351, barrelRate: 0.083, strikeoutRate: 0.228 },
      { handedness: "L", xwoba: 0.366, barrelRate: 0.091, strikeoutRate: 0.214 }
    ],
    homeBullpen: {
      quality: 0.64,
      fatigue: 0.25,
      leverageDepth: 0.67,
      recent3DayPitchCounts: [18, 27, 22]
    },
    awayBullpen: {
      quality: 0.57,
      fatigue: 0.36,
      leverageDepth: 0.58,
      recent3DayPitchCounts: [31, 29, 34]
    },
    parkWeather: {
      parkFactor: venue.parkFactor,
      temperatureF: 73,
      windOutToCenterMph: 12,
      humidityPct: 57,
      altitudeFt: venue.altitudeFt,
      venueName: venue.name,
      forecastSource: "live-provider-ready placeholder",
      runEnvironmentDelta: 0.081
    }
  };
}
