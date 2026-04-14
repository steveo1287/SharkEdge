type CacheValue = string;

const memoryCache = new Map<string, { value: CacheValue; expiresAt: number }>();

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) {
    return null;
  }
  return { url: url.replace(/\/$/, ""), token };
}

async function fetchRedis(path: string, init?: RequestInit) {
  const config = getRedisConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(`${config.url}${path}`, {
    ...init,
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

  return response.json();
}

export async function readHotCache<T>(key: string): Promise<T | null> {
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return JSON.parse(cached.value) as T;
  }

  try {
    const payload = await fetchRedis(`/get/${encodeURIComponent(key)}`);
    const value = payload?.result;
    if (typeof value === "string") {
      memoryCache.set(key, {
        value,
        expiresAt: now + 60_000
      });
      return JSON.parse(value) as T;
    }
  } catch {
    return cached && cached.expiresAt > now ? (JSON.parse(cached.value) as T) : null;
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
    await fetchRedis(`/set/${encodeURIComponent(key)}/${encodeURIComponent(serialized)}?EX=${ttlSeconds}`, {
      method: "POST"
    });
  } catch {
    return;
  }
}

export async function invalidateHotCache(key: string) {
  memoryCache.delete(key);
  try {
    await fetchRedis(`/del/${encodeURIComponent(key)}`, {
      method: "POST"
    });
  } catch {
    return;
  }
}
