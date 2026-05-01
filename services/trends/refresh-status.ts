import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

export const TRENDS_REFRESH_STATUS_KEY = "trends:refresh-status:v1";
const TRENDS_REFRESH_STATUS_TTL_SECONDS = 6 * 60 * 60;

export type TrendsRefreshStatus = {
  generatedAt: string;
  expiresAt: string;
  running: boolean;
  ok: boolean;
  queued: boolean;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  reason?: string | null;
  warnings: string[];
  sourceStatus: Record<string, unknown>;
};

function expiresAt(secondsFromNow: number) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

export async function readTrendRefreshStatus() {
  return readHotCache<TrendsRefreshStatus>(TRENDS_REFRESH_STATUS_KEY);
}

export async function writeTrendRefreshStatus(status: Omit<TrendsRefreshStatus, "generatedAt" | "expiresAt">) {
  const previous = await readTrendRefreshStatus();
  const generatedAt = new Date().toISOString();
  const payload: TrendsRefreshStatus = {
    generatedAt,
    expiresAt: expiresAt(TRENDS_REFRESH_STATUS_TTL_SECONDS),
    ...status,
    lastSuccessAt: status.lastSuccessAt ?? previous?.lastSuccessAt ?? null,
    lastFailureAt: status.lastFailureAt ?? previous?.lastFailureAt ?? null,
  };
  await writeHotCache(TRENDS_REFRESH_STATUS_KEY, payload, TRENDS_REFRESH_STATUS_TTL_SECONDS);
  return payload;
}
