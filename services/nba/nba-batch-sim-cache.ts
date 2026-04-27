import type { PropCardView } from "@/lib/types/domain";
import { buildDataDrivenNbaPlayerSim } from "./nba-data-driven-player-sim";
import type { SimTuningParams } from "@/services/simulation/sim-tuning";

export type CachedNbaSimResult = {
  key: string;
  propId: string;
  generatedAt: string;
  expiresAt: string;
  result: Awaited<ReturnType<typeof buildDataDrivenNbaPlayerSim>>;
};

export type BatchNbaSimCacheResult = {
  generatedAt: string;
  requested: number;
  computed: number;
  cached: number;
  failed: number;
  results: CachedNbaSimResult[];
  errors: Array<{ propId: string; error: string }>;
};

const CACHE_TTL_MS = 1000 * 60 * 8;
const MAX_CACHE_ENTRIES = 1000;
const nbaSimCache = new Map<string, CachedNbaSimResult>();

function prune(now = Date.now()) {
  for (const [key, value] of nbaSimCache.entries()) {
    if (Date.parse(value.expiresAt) <= now) nbaSimCache.delete(key);
  }

  while (nbaSimCache.size > MAX_CACHE_ENTRIES) {
    const first = nbaSimCache.keys().next().value;
    if (!first) break;
    nbaSimCache.delete(first);
  }
}

export function buildNbaSimCacheKey(prop: PropCardView, bankroll?: number) {
  return [
    "nba-sim-v1",
    prop.id,
    prop.gameId,
    prop.player?.id ?? prop.player?.name,
    prop.marketType,
    prop.side,
    prop.line,
    prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
    prop.averageOddsAmerican ?? "avg-null",
    prop.marketDeltaAmerican ?? "delta-null",
    prop.lineMovement ?? "move-null",
    bankroll ?? "bankroll-null"
  ].join("|");
}

export function getCachedNbaSim(prop: PropCardView, bankroll?: number) {
  prune();
  return nbaSimCache.get(buildNbaSimCacheKey(prop, bankroll)) ?? null;
}

export async function getOrBuildCachedNbaSim(prop: PropCardView, tuning?: SimTuningParams, bankroll?: number) {
  const key = buildNbaSimCacheKey(prop, bankroll);
  const cached = getCachedNbaSim(prop, bankroll);
  if (cached) return { cached: true, value: cached };

  const now = Date.now();
  const result = await buildDataDrivenNbaPlayerSim(prop, tuning, bankroll);
  const value: CachedNbaSimResult = {
    key,
    propId: prop.id,
    generatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + CACHE_TTL_MS).toISOString(),
    result
  };
  nbaSimCache.set(key, value);
  prune(now);
  return { cached: false, value };
}

export async function batchBuildNbaSimCache(props: PropCardView[], tuning?: SimTuningParams, bankroll?: number): Promise<BatchNbaSimCacheResult> {
  const startedAt = new Date().toISOString();
  const results: CachedNbaSimResult[] = [];
  const errors: Array<{ propId: string; error: string }> = [];
  let cached = 0;
  let computed = 0;

  const nbaProps = props.filter((prop) => prop.leagueKey === "NBA");

  for (const prop of nbaProps) {
    try {
      const built = await getOrBuildCachedNbaSim(prop, tuning, bankroll);
      if (built.cached) cached++;
      else computed++;
      results.push(built.value);
    } catch (error: any) {
      errors.push({ propId: prop.id, error: error?.message ?? "Unknown NBA sim cache error" });
    }
  }

  return {
    generatedAt: startedAt,
    requested: nbaProps.length,
    computed,
    cached,
    failed: errors.length,
    results,
    errors
  };
}

export function getNbaSimCacheStats() {
  prune();
  return {
    size: nbaSimCache.size,
    ttlMs: CACHE_TTL_MS,
    maxEntries: MAX_CACHE_ENTRIES,
    keys: Array.from(nbaSimCache.keys()).slice(0, 20)
  };
}

export function clearNbaSimCache() {
  nbaSimCache.clear();
}
