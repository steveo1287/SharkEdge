type CacheValue = string;

type RedisCommandArg = string | number;

const memoryCache = new Map<string, { value: CacheValue; expiresAt: number }>();
const DEFAULT_REDIS_TIMEOUT_MS = 1500;

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }
  return { url: url.replace(/\/$/, ""), token };
}

function redisTimeoutMs() {
  const parsed = Number(process.env.HOT_CACHE_REDIS_TIMEOUT_MS ?? DEFAULT_REDIS_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(250, Math.floor(parsed)) : DEFAULT_REDIS_TIMEOUT_MS;
}

function parseCachedValue<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

async function fetchRedis(path: string, init?: RequestInit) {
  const config = getRedisConfig();
  if (!config) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), redisTimeoutMs());

  try {
    const response = await fetch(`${config.url}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Redis request failed (${response.status})`);
    }

    const payload = await response.json();
    if (payload?.error) {
      throw new Error(`Redis command failed: ${payload.error}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function runRedisCommand(args: RedisCommandArg[]) {
  return fetchRedis("", {
    method: "POST",
    body: JSON.stringify(args)
  });
}

export async function readHotCache<T>(key: string): Promise<T | null> {
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    const parsed = parseCachedValue<T>(cached.value);
    if (parsed !== null) return parsed;
    memoryCache.delete(key);
  }

  try {
    const payload = await fetchRedis(`/get/${encodeURIComponent(key)}`);
    const value = payload?.result;
    if (typeof value === "string") {
      const parsed = parseCachedValue<T>(value);
      if (parsed === null) {
        return null;
      }
      memoryCache.set(key, {
        value,
        expiresAt: now + 60_000
      });
      return parsed;
    }
  } catch {
    if (cached && cached.expiresAt > now) {
      return parseCachedValue<T>(cached.value);
    }
    return null;
  }

  return null;
}

export async function writeHotCache<T>(key: string, value: T, ttlSeconds = 60) {
  const serialized = JSON.stringify(value);
  memoryCache.set(key, {
    value: serialized,
    expiresAt: Date.now() + ttlSeconds * 1000
  });

  try {
    await runRedisCommand(["SET", key, serialized, "EX", ttlSeconds]);
  } catch {
    return;
  }
}

export async function invalidateHotCache(key: string) {
  memoryCache.delete(key);
  try {
    await runRedisCommand(["DEL", key]);
  } catch {
    return;
  }
}
