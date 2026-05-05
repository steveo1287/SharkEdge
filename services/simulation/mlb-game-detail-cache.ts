import {
  readSimCache,
  SIM_CACHE_KEYS,
  type CachedSimGameProjection,
  type SimBoardSnapshot,
  type SimMarketSnapshot
} from "@/services/simulation/sim-snapshot-service";

export type CachedMlbGameDetail = {
  row: CachedSimGameProjection;
  edge: SimMarketSnapshot["edges"][number] | null;
  generatedAt: string | null;
  expiresAt: string | null;
  stale: boolean;
  source: "mlb-board-cache";
};

export async function readCachedMlbGameDetail(gameId: string): Promise<CachedMlbGameDetail | null> {
  const [board, market] = await Promise.all([
    readSimCache<SimBoardSnapshot>(SIM_CACHE_KEYS.mlbBoard),
    readSimCache<SimMarketSnapshot>(SIM_CACHE_KEYS.market)
  ]);

  const row = board?.games?.find((item) => item.game.id === gameId) ?? null;
  if (!row) return null;

  return {
    row,
    edge: market?.edges?.find((item) => item.gameId === gameId) ?? null,
    generatedAt: board.generatedAt ?? null,
    expiresAt: board.expiresAt ?? null,
    stale: Boolean(board.stale),
    source: "mlb-board-cache"
  };
}

export function cacheAgeLabel(generatedAt: string | null | undefined) {
  if (!generatedAt) return "cache age unknown";
  const ms = Date.now() - new Date(generatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "cache age unknown";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "cache fresh";
  if (minutes === 1) return "cached 1 min ago";
  return `cached ${minutes} min ago`;
}
