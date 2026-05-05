import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { loadNbaWinnerBacktestRows } from "@/services/backtesting/nba-winner-backtest";
import { buildNbaWinnerFactorWeightReport, type NbaWinnerFactorWeightReport } from "@/services/simulation/nba-winner-factor-weights";

const CACHE_KEY = "nba:winner-runtime-factor-weights:v1";
const CACHE_TTL_SECONDS = 60 * 30;

export async function getNbaWinnerRuntimeFactorWeights(args: { limit?: number } = {}): Promise<NbaWinnerFactorWeightReport | null> {
  const limit = Math.max(1, Math.min(args.limit ?? 5000, 10000));
  const cacheKey = `${CACHE_KEY}:${limit}`;
  const cached = await readHotCache<NbaWinnerFactorWeightReport>(cacheKey);
  if (cached) return cached;

  const rows = await loadNbaWinnerBacktestRows({ limit }).catch(() => []);
  if (!rows.length) return null;

  const report = await buildNbaWinnerFactorWeightReport({ rows, limit });
  await writeHotCache(cacheKey, report, CACHE_TTL_SECONDS);
  return report;
}
