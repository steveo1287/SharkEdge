import { generateTrendAtoms } from "./discovery/atom-generator";
import { scoreTrendAtom } from "./discovery/atom-scorer";
import { runBeamSearch } from "./discovery/beam-search";
import { pruneCorrelatedSystems } from "./discovery/correlation-pruner";
import { validateTrendSystem } from "./validation/validation-suite";
import { buildActiveTrendSignals } from "./activation/active-signal-builder";
import type {
  CandidateTrendSystem,
  HistoricalBetOpportunity,
  SupportedDiscoveryMarket,
  SupportedDiscoverySide,
  TrendDiscoveryConfig
} from "./types";

export const defaultDiscoveryConfig: TrendDiscoveryConfig = {
  minSample: 24,
  minRecentSample: 4,
  minSeasons: 1,
  maxSeedAtoms: 50,
  beamWidth: 20,
  maxConditions: 3,
  maxSystemOverlap: 0.8,
  requirePositiveClv: false
};

export function discoverTrendSystems(
  rows: HistoricalBetOpportunity[],
  options?: Partial<TrendDiscoveryConfig>
) {
  const config = {
    ...defaultDiscoveryConfig,
    ...options
  } satisfies TrendDiscoveryConfig;
  const systems: CandidateTrendSystem[] = [];
  const groups = new Map<string, HistoricalBetOpportunity[]>();

  for (const row of rows) {
    const key = [row.league, row.sport, row.marketType, row.side].join(":");
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  for (const [key, bucket] of groups.entries()) {
    if (bucket.length < config.minSample) {
      continue;
    }

    const [league, sport, marketType, side] = key.split(":") as [string, string, SupportedDiscoveryMarket, SupportedDiscoverySide];
    const atoms = generateTrendAtoms(bucket)
      .map((atom) => scoreTrendAtom(bucket, atom))
      .filter((atom) => atom.sampleSize >= config.minSample / 2)
      .sort((left, right) => right.score - left.score)
      .slice(0, config.maxSeedAtoms)
      .map((entry) => entry.atom);

    const candidates = runBeamSearch({
      rows: bucket,
      league,
      sport,
      marketType,
      side,
      atoms,
      config
    });

    const validated = candidates
      .map((candidate) => validateTrendSystem(candidate, bucket, config))
      .filter((candidate) => candidate.sampleSize >= config.minSample)
      .filter((candidate) => (candidate.roi ?? 0) > 0)
      .sort((left, right) => right.validationScore - left.validationScore)
      .slice(0, 20);

    systems.push(...validated);
  }

  return pruneCorrelatedSystems(systems, config.maxSystemOverlap)
    .sort((left, right) => right.validationScore - left.validationScore)
    .slice(0, 100);
}

export function activateTrendSystems(systems: CandidateTrendSystem[], rows: HistoricalBetOpportunity[]) {
  return buildActiveTrendSignals(systems, rows).sort((left, right) => {
    const edgeDelta = (right.edgePct ?? -999) - (left.edgePct ?? -999);
    if (edgeDelta !== 0) {
      return edgeDelta;
    }
    return left.gameDate.localeCompare(right.gameDate);
  });
}
