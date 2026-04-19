import type { MlbSourceNativeContext } from "@/services/modeling/mlb-source-native-context";
import type { MlbSimulationInput, MlbSimulationSummary } from "@/services/modeling/mlb-game-sim-service";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function certaintyMultiplier(certainty: "HIGH" | "MEDIUM" | "LOW") {
  if (certainty === "HIGH") return 1.015;
  if (certainty === "MEDIUM") return 1;
  return 0.975;
}

export function applyMlbSourceAwareResimulation(
  input: MlbSimulationInput,
  context: MlbSourceNativeContext
): MlbSimulationInput {
  const homeLineupFactor = certaintyMultiplier(context.home.lineupCertainty) * (1 + (context.home.lineupStrength - 50) * 0.0025);
  const awayLineupFactor = certaintyMultiplier(context.away.lineupCertainty) * (1 + (context.away.lineupStrength - 50) * 0.0025);

  const homeStarterConfidenceFactor = clamp(0.96 + context.home.starterConfidence / 100 * 0.08, 0.94, 1.04);
  const awayStarterConfidenceFactor = clamp(0.96 + context.away.starterConfidence / 100 * 0.08, 0.94, 1.04);

  const homeBullpenAvailabilityFactor = clamp(
    1 - (context.home.bullpenFreshness - 50) * 0.002 - (context.home.bullpenCoverage - 50) * 0.0015,
    0.92,
    1.08
  );
  const awayBullpenAvailabilityFactor = clamp(
    1 - (context.away.bullpenFreshness - 50) * 0.002 - (context.away.bullpenCoverage - 50) * 0.0015,
    0.92,
    1.08
  );

  return {
    ...input,
    home: {
      ...input.home,
      offenseFactor: clamp(input.home.offenseFactor * homeLineupFactor, 0.72, 1.5),
      starter: {
        ...input.home.starter,
        expectedOuts: clamp(Math.round(input.home.starter.expectedOuts * homeStarterConfidenceFactor), 9, 24),
        runsAllowedPer9: clamp(input.home.starter.runsAllowedPer9 / homeStarterConfidenceFactor, 1.8, 8),
      },
      bullpen: {
        ...input.home.bullpen,
        runsAllowedPer9: clamp(input.home.bullpen.runsAllowedPer9 * homeBullpenAvailabilityFactor, 2.2, 7.8)
      }
    },
    away: {
      ...input.away,
      offenseFactor: clamp(input.away.offenseFactor * awayLineupFactor, 0.72, 1.5),
      starter: {
        ...input.away.starter,
        expectedOuts: clamp(Math.round(input.away.starter.expectedOuts * awayStarterConfidenceFactor), 9, 24),
        runsAllowedPer9: clamp(input.away.starter.runsAllowedPer9 / awayStarterConfidenceFactor, 1.8, 8),
      },
      bullpen: {
        ...input.away.bullpen,
        runsAllowedPer9: clamp(input.away.bullpen.runsAllowedPer9 * awayBullpenAvailabilityFactor, 2.2, 7.8)
      }
    }
  };
}

export function recalibrateMlbMarketOutputs(
  summary: MlbSimulationSummary,
  context: MlbSourceNativeContext
): MlbSimulationSummary {
  const certaintyScore =
    context.home.starterConfidence * 0.2 +
    context.away.starterConfidence * 0.2 +
    context.home.bullpenCoverage * 0.15 +
    context.away.bullpenCoverage * 0.15 +
    (context.home.lineupCertainty === "HIGH" ? 10 : context.home.lineupCertainty === "MEDIUM" ? 6 : 2) +
    (context.away.lineupCertainty === "HIGH" ? 10 : context.away.lineupCertainty === "MEDIUM" ? 6 : 2);

  const shrink = clamp(0.18 - certaintyScore / 1000, 0.06, 0.18);
  const baselineTotal = 8.7 * context.venue.baselineRunFactor;
  const calibratedTotal = summary.projectedTotalRuns * (1 - shrink) + baselineTotal * shrink;
  const calibratedSpread = summary.projectedSpreadHome * (1 - shrink * 0.85);
  const calibratedWinProbHome = 0.5 + (summary.winProbHome - 0.5) * (1 - shrink);
  const calibratedHomeRuns = (calibratedTotal + calibratedSpread) / 2;
  const calibratedAwayRuns = calibratedTotal - calibratedHomeRuns;

  return {
    ...summary,
    projectedHomeRuns: Number(calibratedHomeRuns.toFixed(3)),
    projectedAwayRuns: Number(calibratedAwayRuns.toFixed(3)),
    projectedTotalRuns: Number(calibratedTotal.toFixed(3)),
    projectedSpreadHome: Number(calibratedSpread.toFixed(3)),
    winProbHome: Number(calibratedWinProbHome.toFixed(4)),
    winProbAway: Number((1 - calibratedWinProbHome).toFixed(4)),
    diagnostics: {
      ...summary.diagnostics,
      weatherFactor: Number((summary.diagnostics.weatherFactor * (1 - shrink * 0.2)).toFixed(3))
    }
  };
}
