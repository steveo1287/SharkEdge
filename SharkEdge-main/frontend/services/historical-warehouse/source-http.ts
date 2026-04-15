import { gunzipSync } from "node:zlib";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MIN_DELAY_MS = 650;
const DEFAULT_MAX_DELAY_MS = 1_500;

type CacheEntry = {
  expiresAt: number;
  value: string;
};

type RequestOptions = {
  cacheTtlMs?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  accept?: string;
  headers?: Record<string, string>;
};

type GitHubAsset = {
  name: string;
  browser_download_url: string;
};

type GitHubRelease = {
  assets: GitHubAsset[];
};

const cache = new Map<string, CacheEntry>();

let lastRequestAt = 0;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15"
];

function getProxyDispatcher() {
  const proxyUrl = process.env.PROXY_URL?.trim();
  if (!proxyUrl) {
    return undefined;
  }

  try {
    const runtimeRequire = Function("return require")() as (
      id: string
    ) => { ProxyAgent: new (url: string) => unknown };
    const { ProxyAgent } = runtimeRequire("undici");
    return new ProxyAgent(proxyUrl);
  } catch {
    return undefined;
  }
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pace(minDelayMs = DEFAULT_MIN_DELAY_MS, maxDelayMs = DEFAULT_MAX_DELAY_MS) {
  const jitter = Math.floor(Math.random() * Math.max(maxDelayMs - minDelayMs, 1)) + minDelayMs;
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < jitter) {
    await sleep(jitter - elapsed);
  }
  lastRequestAt = Date.now();
}

function getCacheValue(key: string) {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function setCacheValue(key: string, value: string, ttlMs: number) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

async function fetchTextRaw(url: string, options?: RequestOptions) {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const proxyDispatcher = getProxyDispatcher();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await pace(options?.minDelayMs, options?.maxDelayMs);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: options?.accept ?? "*/*",
        "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        "Cache-Control": "no-cache",
        ...(options?.headers ?? {})
      },
      ...(proxyDispatcher ? ({ dispatcher: proxyDispatcher } as object) : {})
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (contentType.includes("gzip") || url.endsWith(".gz")) {
      return gunzipSync(buffer).toString("utf8");
    }

    return buffer.toString("utf8");
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchTextWithRetry(url: string, options?: RequestOptions) {
  const cacheKey = `text:${url}`;
  const ttlMs = options?.cacheTtlMs ?? 0;
  if (ttlMs > 0) {
    const cached = getCacheValue(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const value = await fetchTextRaw(url, options);
      if (ttlMs > 0) {
        setCacheValue(cacheKey, value, ttlMs);
      }
      return value;
    } catch (error) {
      lastError = error;
      await sleep((attempt + 1) * 900);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`);
}

export async function fetchJsonWithRetry<T>(url: string, options?: RequestOptions): Promise<T> {
  const raw = await fetchTextWithRetry(url, {
    ...options,
    accept: "application/json"
  });
  return JSON.parse(raw) as T;
}

export async function resolveGitHubReleaseAssetUrl(args: {
  owner: string;
  repo: string;
  tag: string;
  assetName: string;
}) {
  const release = await fetchJsonWithRetry<GitHubRelease>(
    `https://api.github.com/repos/${args.owner}/${args.repo}/releases/tags/${args.tag}`,
    {
      cacheTtlMs: 30 * 60 * 1000,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28"
      }
    }
  );

  return release.assets.find((asset) => asset.name === args.assetName)?.browser_download_url ?? null;
}

type CsvRecord = Record<string, string>;

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    rows.push(row);
  }

  const [headerRow, ...bodyRows] = rows;
  if (!headerRow?.length) {
    return [] as CsvRecord[];
  }

  const headers = headerRow.map((header) => header.trim());
  return bodyRows
    .filter((bodyRow) => bodyRow.some((column) => column.trim().length > 0))
    .map((bodyRow) =>
      headers.reduce<CsvRecord>((record, header, index) => {
        record[header] = bodyRow[index] ?? "";
        return record;
      }, {})
    );
}
