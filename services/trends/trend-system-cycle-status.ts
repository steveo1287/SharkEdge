import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

export const TREND_SYSTEM_CYCLE_STATUS_KEY = "trends:system-cycle-status:v1";
const TREND_SYSTEM_CYCLE_STATUS_TTL_SECONDS = 12 * 60 * 60;

export type TrendSystemCycleStatus = {
  generatedAt: string;
  expiresAt: string;
  ok: boolean;
  running: boolean;
  lastStartedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  durationMs: number | null;
  league: string;
  limit: number;
  reason: string | null;
  warnings: string[];
  summary: {
    capturedMatches: number;
    closingLinesUpdated: number;
    gradedMatches: number;
    snapshotsWritten: number;
    savedLedgerBacked: number;
    eventMarketBacked: number;
    seededFallback: number;
    totalSavedRows: number;
    totalSavedGradedRows: number;
    totalOpenRows: number;
  };
  sourceStatus: Record<string, unknown>;
};

function expiresAt(secondsFromNow: number) {
  return new Date(Date.now() + secondsFromNow * 1000).toISOString();
}

export async function readTrendSystemCycleStatus() {
  return readHotCache<TrendSystemCycleStatus>(TREND_SYSTEM_CYCLE_STATUS_KEY);
}

export async function writeTrendSystemCycleStatus(
  status: Omit<TrendSystemCycleStatus, "generatedAt" | "expiresAt" | "lastSuccessAt" | "lastFailureAt"> & {
    lastSuccessAt?: string | null;
    lastFailureAt?: string | null;
  }
) {
  const previous = await readTrendSystemCycleStatus();
  const generatedAt = new Date().toISOString();
  const payload: TrendSystemCycleStatus = {
    generatedAt,
    expiresAt: expiresAt(TREND_SYSTEM_CYCLE_STATUS_TTL_SECONDS),
    ...status,
    lastSuccessAt: status.lastSuccessAt ?? previous?.lastSuccessAt ?? null,
    lastFailureAt: status.lastFailureAt ?? previous?.lastFailureAt ?? null
  };
  await writeHotCache(TREND_SYSTEM_CYCLE_STATUS_KEY, payload, TREND_SYSTEM_CYCLE_STATUS_TTL_SECONDS);
  return payload;
}

export function emptyTrendSystemCycleSummary(): TrendSystemCycleStatus["summary"] {
  return {
    capturedMatches: 0,
    closingLinesUpdated: 0,
    gradedMatches: 0,
    snapshotsWritten: 0,
    savedLedgerBacked: 0,
    eventMarketBacked: 0,
    seededFallback: 0,
    totalSavedRows: 0,
    totalSavedGradedRows: 0,
    totalOpenRows: 0
  };
}
