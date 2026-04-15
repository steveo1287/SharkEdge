import type { CandidateTrendSystem } from "../types";

export function assignTrendTier(system: CandidateTrendSystem) {
  if (system.sampleSize >= 120 && (system.roi ?? 0) > 0.04 && (system.avgClv ?? 0) >= 0) {
    return "A" as const;
  }

  if (system.sampleSize >= 70 && (system.roi ?? 0) > 0.02) {
    return "B" as const;
  }

  return "C" as const;
}
