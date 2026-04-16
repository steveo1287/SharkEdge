import type { MlbEliteSimSnapshot, MlbPitchContext } from "@/lib/types/mlb-elite";
import { buildMlbAdvancedGameContext } from "@/services/modeling/adapters/mlb-game-context-service";
import { buildMlbAtBatProbabilityChain } from "@/services/modeling/mlb-probability-chain";
import { getCurrentMlbLeagueEnvironment, normalizeMlbTotalToLeagueEnvironment } from "@/services/modeling/mlb-league-normalization-service";

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildPitchContext(): MlbPitchContext {
  return {
    pitchCount: 68,
    pitcherFatigue: 0.18,
    batterFatigue: 0.06,
    leverageIndex: 1.14
  };
}

export async function buildMlbEliteSimSnapshot(eventId: string): Promise<MlbEliteSimSnapshot> {
  const context = await buildMlbAdvancedGameContext(eventId);
  const leagueEnvironment = getCurrentMlbLeagueEnvironment();
  const pitchContext = buildPitchContext();

  const homeContact = average(context.homeLineupVsHandedness.map((item) => 1 - item.strikeoutRate));
  const homePower = average(context.homeLineupVsHandedness.map((item) => item.barrelRate)) * 4.2;
  const awayContact = average(context.awayLineupVsHandedness.map((item) => 1 - item.strikeoutRate));
  const awayPower = average(context.awayLineupVsHandedness.map((item) => item.barrelRate)) * 4.2;

  const homeChain = buildMlbAtBatProbabilityChain(
    {
      batterContact: homeContact,
      batterPower: homePower,
      batterEye: 0.58,
      pitcherStuff: 0.64 + pitchContext.pitcherFatigue * 0.1,
      pitcherControl: 0.61 - pitchContext.pitcherFatigue * 0.08,
      pitcherMovement: 0.57
    },
    {
      targetRunsPerGame: leagueEnvironment.targetRunsPerGame,
      targetHomeRunsPerGame: leagueEnvironment.targetHomeRunsPerGame,
      homeRunModifier: 1,
      runModifier: 1 + context.parkWeather.runEnvironmentDelta * 0.25
    }
  );

  const awayChain = buildMlbAtBatProbabilityChain(
    {
      batterContact: awayContact,
      batterPower: awayPower,
      batterEye: 0.56,
      pitcherStuff: 0.68 + pitchContext.pitcherFatigue * 0.08,
      pitcherControl: 0.63 - pitchContext.pitcherFatigue * 0.06,
      pitcherMovement: 0.6
    },
    {
      targetRunsPerGame: leagueEnvironment.targetRunsPerGame,
      targetHomeRunsPerGame: leagueEnvironment.targetHomeRunsPerGame,
      homeRunModifier: 1,
      runModifier: 1 + context.parkWeather.runEnvironmentDelta * 0.25
    }
  );

  const bullpenFatigueDelta =
    ((context.homeBullpen.fatigue + context.awayBullpen.fatigue) / 2) -
    ((context.homeBullpen.quality + context.awayBullpen.quality) / 3);

  const rawTotal =
    8.4 +
    homeChain.expectedRunsAdded * 2.7 +
    awayChain.expectedRunsAdded * 2.7 +
    context.parkWeather.runEnvironmentDelta * 1.4 -
    bullpenFatigueDelta * 1.1;

  const normalized = normalizeMlbTotalToLeagueEnvironment(rawTotal, leagueEnvironment);

  return {
    eventId,
    leagueEnvironment,
    homeExpectedRuns: Number((normalized.normalizedTotal * 0.52).toFixed(2)),
    awayExpectedRuns: Number((normalized.normalizedTotal * 0.48).toFixed(2)),
    normalizedTotal: normalized.normalizedTotal,
    parkWeatherDelta: context.parkWeather.runEnvironmentDelta,
    bullpenFatigueDelta: Number(bullpenFatigueDelta.toFixed(4)),
    topMicroDrivers: [
      {
        label: "Starter handedness split",
        value: Number(homeContact.toFixed(3)),
        detail: `Home lineup quality vs ${context.probableAwayStarterHandedness ?? "R"} starter.`
      },
      {
        label: "Bullpen workload",
        value: Number(((context.homeBullpen.fatigue + context.awayBullpen.fatigue) / 2).toFixed(3)),
        detail: "Three-day bullpen pitch volume is impacting late-game stability."
      },
      {
        label: "Park and weather",
        value: Number(context.parkWeather.runEnvironmentDelta.toFixed(3)),
        detail: `${context.parkWeather.venueName ?? "Venue"} weather is moving run environment.`
      },
      {
        label: "Contact quality",
        value: Number(((homePower + awayPower) / 2).toFixed(3)),
        detail: "Barrel quality is raising expected damage on contact."
      }
    ]
  };
}
