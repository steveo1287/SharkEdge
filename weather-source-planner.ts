import type { CandidateTrendSystem } from "../types";

export function getSeasonStabilityScore(system: CandidateTrendSystem) {
  if (system.seasons.length <= 1) {
    return 0;
  }

  return Math.min(system.seasons.length / 4, 1);
}
