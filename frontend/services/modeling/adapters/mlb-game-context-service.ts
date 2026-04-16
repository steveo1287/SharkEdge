import { fetchLiveMlbGameInputs } from "@/services/modeling/adapters/mlb-live-provider";
import type { MlbAdvancedGameContext } from "@/lib/types/mlb-advanced";

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export async function buildMlbAdvancedGameContext(eventId: string): Promise<MlbAdvancedGameContext> {
  const live = await fetchLiveMlbGameInputs(eventId);
  const avgBarrel = average([
    ...live.homeLineupVsHandedness.map((item) => item.barrelRate),
    ...live.awayLineupVsHandedness.map((item) => item.barrelRate)
  ]);

  return {
    ...live,
    parkWeather: {
      ...live.parkWeather,
      runEnvironmentDelta: Number(
        (
          live.parkWeather.runEnvironmentDelta +
          avgBarrel * 0.18 +
          ((live.parkWeather.temperatureF - 65) / 100) +
          (live.parkWeather.windOutToCenterMph / 100)
        ).toFixed(4)
      )
    }
  };
}
