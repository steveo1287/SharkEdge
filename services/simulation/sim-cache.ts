import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { LeagueKey } from "@/lib/types/domain";
import type { PlayerSimV2Output } from "./player-sim-v2";

export const SIM_CACHE_VERSION = "v2";

export const SIM_CACHE_KEYS = {
  hub: `sim:hub:${SIM_CACHE_VERSION}`,
  priority: `sim:priority:${SIM_CACHE_VERSION}`,
  nbaBoard: `sim:nba:board:${SIM_CACHE_VERSION}`,
  mlbBoard: `sim:mlb:board:${SIM_CACHE_VERSION}`,
  lastRefresh: `sim:last-refresh:${SIM_CACHE_VERSION}`,
  refreshStatus: `sim:refresh-status:${SIM_CACHE_VERSION}`,
  market: `sim:market:${SIM_CACHE_VERSION}`
} as const;

const SIM_CACHE_READ_TIMEOUT_MS = 2_000;
const PROP_CACHE_TTL_MS = 15 * 60 * 1000;
const PROP_GAME_TIME_TTL_MS = 5 * 60 * 1000;

type NumericValue = number | null | undefined;

export type CachedSim = {
  propId: string;
  playerId: string;
  playerName: string;
  propType: string;
  line: number;
  odds: number;
  result: PlayerSimV2Output & { betSizing?: any; nbaRoleAnalysis?: any };
  computedAt: number;
  expiresAt: number;
};

const PROP_CACHE_STORE = new Map<string, CachedSim>();

export type SimGame = {
  id: string;
  label: string;
  startTime: string;
  status: string;
  leagueKey: LeagueKey;
  leagueLabel: string;
};

export type CachedSimProjection = {
  matchup: { away: string; home: string };
  distribution: {
    avgAway: number;
    avgHome: number;
    homeWinPct: number;
    awayWinPct: number;
  };
  read?: string;
  statSheet?: unknown;
  nbaIntel?: null | {
    modelVersion?: string;
    dataSource?: string;
    confidence?: number;
    noBet?: boolean;
    tier?: "attack" | "watch" | "pass";
    reasons?: string[];
    projectedTotal?: number;
    volatilityIndex?: number;
    playerStatProjectionCount?: number;
  };
  realityIntel?: unknown;
  mlbIntel?: null | {
    projectedTotal?: number;
    volatilityIndex?: number;
    governor?: {
      confidence?: number;
      noBet?: boolean;
      tier?: string;
      reasons?: string[];
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CachedSimGameProjection = {
  game: SimGame;
  projection: CachedSimProjection;
};

export type SimPriorityRow = {
  id: string;
  leagueKey: LeagueKey;
  status: string;
  startTime: string;
  matchup: { away: string; home: string };
  lean: { team: string; pct: number; edge: number };
  tier: string;
  confidence: number | null;
  homeEdge: number | null;
  edgeMatched: boolean;
  href: string;
};

export type SimSnapshotEnvelope<T> = {
  generatedAt: string;
  expiresAt: string;
  stale: boolean;
  warnings: string[];
  sourceStatus: Record<string, unknown>;
} & T;

export type SimHubSnapshot = SimSnapshotEnvelope<{
  summary: { nbaCount: number; mlbCount: number; priorityCount: number; matchedMlbLines: number };
}>;

export type SimBoardSnapshot = SimSnapshotEnvelope<{ games: CachedSimGameProjection[] }>;

export type SimPrioritySnapshot = SimSnapshotEnvelope<{
  rows: SimPriorityRow[];
  summary: { gameCount: number; rowCount: number; nbaCount: number; mlbCount: number; matchedMlbLines: number };
}>;

export type SimMarketEdge = {
  gameId: string;
  market?: {
    homeMoneyline?: NumericValue;
    awayMoneyline?: NumericValue;
    total?: NumericValue;
    overPrice?: NumericValue;
    underPrice?: NumericValue;
    [key: string]: unknown;
  } | null;
  edges?: {
    homeMoneyline?: NumericValue;
    awayMoneyline?: NumericValue;
    totalRuns?: NumericValue;
    [key: string]: unknown;
  } | null;
  projection?: {
    mlbIntel?: { projectedTotal?: number; [key: string]: unknown } | null;
    [key: string]: unknown;
  } | null;
  signal?: {
    market?: string;
    strength?: string;
    [key: string]: unknown;
  } | null;
  marketQuality?: { warnings?: string[]; [key: string]: unknown } | null;
  [key: string]: unknown;
};

export type SimMarketSnapshot = SimSnapshotEnvelope<{
  edges: SimMarketEdge[];
  lineCount: number;
  gameCount: number;
}>;

export type SimRefreshStatusSnapshot = SimSnapshotEnvelope<{
  ok: boolean;
  running: boolean;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  reason?: string;
}>;

function isSnapshotStale(snapshot: { expiresAt?: string | null } | null | undefined) {
  if (!snapshot?.expiresAt) return true;
  return new Date(snapshot.expiresAt).getTime() <= Date.now();
}

function markSnapshotState<T extends { expiresAt?: string; stale?: boolean }>(snapshot: T | null): (T & { stale: boolean }) | null {
  if (!snapshot) return null;
  return { ...snapshot, stale: isSnapshotStale(snapshot) };
}

function timeoutAfter<T>(ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(fallback), ms));
}

export async function readSimCache<T extends { expiresAt?: string; stale?: boolean }>(key: string) {
  const startedAt = Date.now();
  const value = await Promise.race([
    readHotCache<T>(key).then(markSnapshotState).catch(() => null),
    timeoutAfter<null>(SIM_CACHE_READ_TIMEOUT_MS, null)
  ]);
  console.info(`[sim-cache] read ${key} ${value ? "hit" : "miss"}${value?.stale ? " stale" : ""} ${Date.now() - startedAt}ms`);
  return value;
}

export async function writeSimCache<T>(key: string, value: T, ttlSeconds: number) {
  const startedAt = Date.now();
  await writeHotCache(key, value, ttlSeconds);
  console.info(`[sim-cache] write ${key} ttl=${ttlSeconds}s ${Date.now() - startedAt}ms`);
}

export function getCacheKey(propId: string): string {
  return `sim:${propId}`;
}

export function getCachedSim(propId: string): CachedSim | null {
  const cacheKey = getCacheKey(propId);
  const cached = PROP_CACHE_STORE.get(cacheKey);
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    PROP_CACHE_STORE.delete(cacheKey);
    return null;
  }

  return cached;
}

export function setCachedSim(
  propId: string,
  playerId: string,
  playerName: string,
  propType: string,
  line: number,
  odds: number,
  result: PlayerSimV2Output & { betSizing?: any; nbaRoleAnalysis?: any },
  isGameTime = false
): CachedSim {
  const ttl = isGameTime ? PROP_GAME_TIME_TTL_MS : PROP_CACHE_TTL_MS;
  const cached: CachedSim = {
    propId,
    playerId,
    playerName,
    propType,
    line,
    odds,
    result,
    computedAt: Date.now(),
    expiresAt: Date.now() + ttl
  };

  PROP_CACHE_STORE.set(getCacheKey(propId), cached);
  return cached;
}

export function invalidatePropCache(propId: string): void {
  PROP_CACHE_STORE.delete(getCacheKey(propId));
}

export function invalidatePlayerCache(playerName: string): void {
  for (const [key, cached] of PROP_CACHE_STORE) {
    if (cached.playerName === playerName) {
      PROP_CACHE_STORE.delete(key);
    }
  }
}

export function clearCache(): void {
  PROP_CACHE_STORE.clear();
}

export function getCacheStats(): {
  total: number;
  expired: number;
  active: number;
} {
  let expired = 0;
  let active = 0;

  for (const cached of PROP_CACHE_STORE.values()) {
    if (Date.now() > cached.expiresAt) {
      expired++;
    } else {
      active++;
    }
  }

  return {
    total: PROP_CACHE_STORE.size,
    expired,
    active
  };
}
