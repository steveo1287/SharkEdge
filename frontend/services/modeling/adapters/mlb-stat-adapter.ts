import type { SportStatAdapterInput, SportStatAdapterResult } from "@/lib/types/advanced-stat-adapters";
import { buildMlbAdvancedGameContext } from "@/services/modeling/adapters/mlb-game-context-service";

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function getMlbAdvancedStats(input: SportStatAdapterInput): Promise<SportStatAdapterResult> {
  const context = await buildMlbAdvancedGameContext(input.eventId);

  const homeXwoba = average(context.homeLineupVsHandedness.map((item) => item.xwoba));
  const awayXwoba = average(context.awayLineupVsHandedness.map((item) => item.xwoba));
  const homeBarrel = average(context.homeLineupVsHandedness.map((item) => item.barrelRate));
  const awayBarrel = average(context.awayLineupVsHandedness.map((item) => item.barrelRate));

  const offenseBlend = clamp(((homeXwoba + awayXwoba) / 2 - 0.3) / 0.1, 0, 1);
  const barrelBlend = clamp(((homeBarrel + awayBarrel) / 2) / 0.15, 0, 1);
  const fipBlend = clamp(1 - ((context.homeStarterFip + context.awayStarterFip) / 2 - 3.2) / 2.2, 0, 1);

  return {
    sport: "MLB",
    source: "mlb-game-context-service",
    metrics: {
      woba: Number((((homeXwoba + awayXwoba) / 2 - 0.29) / 0.09).toFixed(4)),
      xwoba: Number(offenseBlend.toFixed(4)),
      fip: Number(fipBlend.toFixed(4)),
      barrel_rate: Number(barrelBlend.toFixed(4)),
      park_factor: Number((context.parkWeather.parkFactor / 1.2).toFixed(4)),
      run_environment_delta: Number(context.parkWeather.runEnvironmentDelta.toFixed(4)),
      bullpen_quality: Number((((context.homeBullpen.quality + context.awayBullpen.quality) / 2)).toFixed(4))
    },
    notes: [
      "MLB adapter blends lineup xwOBA splits, starter FIP, bullpen quality/fatigue, and park/weather run environment.",
      `Park factor ${context.parkWeather.parkFactor}, wind ${context.parkWeather.windOutToCenterMph} mph out to center.`
    ]
  };
}
