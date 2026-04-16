import type { MlbLeagueEnvironment } from "@/lib/types/mlb-elite";

export function getCurrentMlbLeagueEnvironment(): MlbLeagueEnvironment {
  return {
    era: "modern",
    targetRunsPerGame: 4.62,
    targetHomeRunsPerGame: 1.14,
    targetStrikeoutsPerGame: 8.46,
    targetWalksPerGame: 3.18
  };
}

export function normalizeMlbTotalToLeagueEnvironment(total: number, environment: MlbLeagueEnvironment) {
  const baseline = environment.targetRunsPerGame * 2;
  const modifier = baseline > 0 ? baseline / Math.max(total, 0.01) : 1;
  const cappedModifier = Math.max(0.9, Math.min(1.1, modifier));
  return {
    normalizedTotal: Number((total * cappedModifier).toFixed(2)),
    normalizationModifier: Number(cappedModifier.toFixed(4))
  };
}
