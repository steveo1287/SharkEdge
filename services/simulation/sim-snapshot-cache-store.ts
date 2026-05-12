import { Prisma } from "@prisma/client";

import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

const SIM_SNAPSHOT_SCOPE = "sim_snapshot";

export async function readSnapshotCache<T>(key: string): Promise<T | null> {
  const hot = await readHotCache<T>(key);
  if (hot) return hot;

  if (!hasUsableServerDatabaseUrl()) return null;

  try {
    const cached = await prisma.trendCache.findUnique({
      where: { cacheKey: key },
      select: { payloadJson: true }
    });
    return (cached?.payloadJson as T | undefined) ?? null;
  } catch (error) {
    console.warn("[sim-cache] postgres snapshot read failed", {
      key,
      reason: error instanceof Error ? error.message : "unknown error"
    });
    return null;
  }
}

export async function writeSnapshotCache<T>(key: string, value: T, ttlSeconds: number) {
  await writeHotCache(key, value, ttlSeconds);

  if (!hasUsableServerDatabaseUrl()) return;

  try {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await prisma.trendCache.upsert({
      where: { cacheKey: key },
      update: {
        scope: SIM_SNAPSHOT_SCOPE,
        filterJson: { key },
        payloadJson: value as Prisma.InputJsonValue,
        expiresAt
      },
      create: {
        cacheKey: key,
        scope: SIM_SNAPSHOT_SCOPE,
        filterJson: { key },
        payloadJson: value as Prisma.InputJsonValue,
        expiresAt
      }
    });
  } catch (error) {
    console.warn("[sim-cache] postgres snapshot write failed", {
      key,
      reason: error instanceof Error ? error.message : "unknown error"
    });
  }
}
