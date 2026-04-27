import type { PlayerSimV2Output } from "./player-sim-v2";

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

const CACHE_STORE = new Map<string, CachedSim>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes default
const GAME_TIME_TTL_MS = 5 * 60 * 1000; // 5 minutes during games

export function getCacheKey(propId: string): string {
  return `sim:${propId}`;
}

export function getCachedSim(propId: string): CachedSim | null {
  const cached = CACHE_STORE.get(getCacheKey(propId));
  if (!cached) return null;

  if (Date.now() > cached.expiresAt) {
    CACHE_STORE.delete(getCacheKey(propId));
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
  isGameTime: boolean = false
): CachedSim {
  const ttl = isGameTime ? GAME_TIME_TTL_MS : CACHE_TTL_MS;
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

  CACHE_STORE.set(getCacheKey(propId), cached);
  return cached;
}

export function invalidatePropCache(propId: string): void {
  CACHE_STORE.delete(getCacheKey(propId));
}

export function invalidatePlayerCache(playerName: string): void {
  for (const [key, cached] of CACHE_STORE) {
    if (cached.playerName === playerName) {
      CACHE_STORE.delete(key);
    }
  }
}

export function clearCache(): void {
  CACHE_STORE.clear();
}

export function getCacheStats(): {
  total: number;
  expired: number;
  active: number;
} {
  let expired = 0;
  let active = 0;

  for (const cached of CACHE_STORE.values()) {
    if (Date.now() > cached.expiresAt) {
      expired++;
    } else {
      active++;
    }
  }

  return {
    total: CACHE_STORE.size,
    expired,
    active
  };
}
