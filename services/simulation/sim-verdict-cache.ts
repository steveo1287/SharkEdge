import type { GameSimVerdict } from "@/services/simulation/sim-verdict-engine";

const CACHE_TTL_MS = 3 * 60 * 1000;

type CacheEntry = {
  verdict: GameSimVerdict;
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();

export function setSimVerdict(eventId: string, verdict: GameSimVerdict): void {
  store.set(eventId, {
    verdict,
    expiresAt: Date.now() + CACHE_TTL_MS
  });
}

export function getSimVerdict(eventId: string): GameSimVerdict | null {
  const entry = store.get(eventId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(eventId);
    return null;
  }
  return entry.verdict;
}

export function getAllCachedSimVerdicts(eventIds: string[]): Map<string, GameSimVerdict> {
  const now = Date.now();
  const result = new Map<string, GameSimVerdict>();
  for (const id of eventIds) {
    const entry = store.get(id);
    if (entry && entry.expiresAt >= now) {
      result.set(id, entry.verdict);
    } else if (entry) {
      store.delete(id);
    }
  }
  return result;
}

export function clearSimVerdictCache(): void {
  store.clear();
}
