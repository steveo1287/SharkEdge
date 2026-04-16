import { buildMlbAdvancedGameContext } from "@/services/modeling/adapters/mlb-game-context-service";
import { buildMlbAtBatProbabilityChain } from "@/services/modeling/mlb-probability-chain";

export async function applyMlbRunEnvironmentAdjustment(eventId: string, baseProjectedTotal: number) {
  const context = await buildMlbAdvancedGameContext(eventId);
  const bullpenDelta = ((context.homeBullpen.quality - context.homeBullpen.fatigue) + (context.awayBullpen.quality - context.awayBullpen.fatigue)) / 2;
  const adjustedTotal = baseProjectedTotal * (1 + context.parkWeather.runEnvironmentDelta * 0.35 - bullpenDelta * 0.08);
  return {
    adjustedTotal: Number(adjustedTotal.toFixed(2)),
    runEnvironmentDelta: context.parkWeather.runEnvironmentDelta,
    bullpenDelta: Number(bullpenDelta.toFixed(4)),
    context
  };
}

export async function buildMlbProbabilitySnapshot(eventId: string) {
  const context = await buildMlbAdvancedGameContext(eventId);

  const homeMatchup = buildMlbAtBatProbabilityChain(
    {
      batterContact: 0.63,
      batterPower: 0.66,
      batterEye: 0.58,
      pitcherStuff: 0.64,
      pitcherControl: 0.61,
      pitcherMovement: 0.57
    },
    {
      targetRunsPerGame: 4.62,
      targetHomeRunsPerGame: 1.14,
      homeRunModifier: 1,
      runModifier: 1 + context.parkWeather.runEnvironmentDelta * 0.25
    }
  );

  const awayMatchup = buildMlbAtBatProbabilityChain(
    {
      batterContact: 0.59,
      batterPower: 0.61,
      batterEye: 0.56,
      pitcherStuff: 0.68,
      pitcherControl: 0.63,
      pitcherMovement: 0.6
    },
    {
      targetRunsPerGame: 4.62,
      targetHomeRunsPerGame: 1.14,
      homeRunModifier: 1,
      runModifier: 1 + context.parkWeather.runEnvironmentDelta * 0.25
    }
  );

  return {
    eventId,
    homeMatchup,
    awayMatchup,
    context,
    leagueTotals: {
      targetRunsPerGame: 4.62,
      targetHomeRunsPerGame: 1.14
    }
  };
}
