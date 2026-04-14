import type { CandidateTrendSystem, TrendDiscoveryConfig } from "../types";

export function passesSampleGates(system: CandidateTrendSystem, config: TrendDiscoveryConfig) {
  return (
    system.sampleSize >= config.minSample &&
    system.recentSampleSize >= config.minRecentSample &&
    system.seasons.length >= config.minSeasons
  );
}
