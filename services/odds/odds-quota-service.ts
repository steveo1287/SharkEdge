import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

const QUOTA_CACHE_KEY = "odds:quota:last:v1";
const MONTHLY_LIMIT = Number(process.env.ODDS_MONTHLY_LIMIT ?? 500);
const SAFE_STOP = Number(process.env.ODDS_SAFE_STOP ?? 450);
const DAILY_BUDGET = Number(process.env.ODDS_DAILY_BUDGET ?? 12);
const BASE_URL = "https://api.the-odds-api.com/v4";

type QuotaSnapshot = {
  ok: boolean;
  checkedAt: string;
  mode: "cached" | "sports-check" | "odds-probe" | "missing-key" | "error";
  provider: "the-odds-api";
  monthlyLimit: number;
  safeStop: number;
  dailyBudget: number;
  used: number | null;
  remaining: number | null;
  lastRequestCost: number | null;
  exhausted: boolean | null;
  safeStopped: boolean | null;
  status: string;
  details: string;
};

function getApiKey() {
  return process.env.THE_ODDS_API_KEY?.trim() || process.env.ODDS_API_KEY?.trim() || process.env.NEXT_PUBLIC_THE_ODDS_API_KEY?.trim() || null;
}

function parseHeaderNumber(headers: Headers, name: string) {
  const raw = headers.get(name) ?? headers.get(name.toLowerCase());
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function classify(used: number | null, remaining: number | null) {
  const exhausted = remaining == null ? null : remaining <= 0;
  const safeStopped = used == null ? null : used >= SAFE_STOP;
  const status = exhausted ? "EXHAUSTED" : safeStopped ? "SAFE_STOP" : remaining == null && used == null ? "UNKNOWN" : "OK";
  return { exhausted, safeStopped, status };
}

async function cache(snapshot: QuotaSnapshot) {
  await writeHotCache(QUOTA_CACHE_KEY, snapshot, 60 * 60 * 12);
  return snapshot;
}

export async function getCachedOddsQuota() {
  return readHotCache<QuotaSnapshot>(QUOTA_CACHE_KEY);
}

export async function checkOddsQuota(mode: "cached" | "sports-check" | "odds-probe" = "cached") {
  const cached = await getCachedOddsQuota();
  if (mode === "cached" && cached) return { ...cached, mode: "cached" as const };

  const apiKey = getApiKey();
  if (!apiKey) {
    return cache({ ok: false, checkedAt: new Date().toISOString(), mode: "missing-key", provider: "the-odds-api", monthlyLimit: MONTHLY_LIMIT, safeStop: SAFE_STOP, dailyBudget: DAILY_BUDGET, used: null, remaining: null, lastRequestCost: null, exhausted: null, safeStopped: null, status: "MISSING_KEY", details: "Missing THE_ODDS_API_KEY or ODDS_API_KEY in environment." });
  }

  if (mode === "cached" && !cached) mode = "sports-check";
  const endpoint = mode === "odds-probe" ? `${BASE_URL}/sports/baseball_mlb/odds/?regions=us&markets=h2h,totals&oddsFormat=american&apiKey=${encodeURIComponent(apiKey)}` : `${BASE_URL}/sports/?apiKey=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    const used = parseHeaderNumber(response.headers, "x-requests-used");
    const remaining = parseHeaderNumber(response.headers, "x-requests-remaining");
    const lastRequestCost = parseHeaderNumber(response.headers, "x-requests-last");
    const state = classify(used, remaining);
    const details = response.ok
      ? mode === "odds-probe"
        ? "Live MLB odds probe completed. This can consume quota depending on provider rules."
        : "Sports endpoint check completed. If quota headers are absent, run mode=odds-probe manually."
      : `Provider returned HTTP ${response.status}.`;

    return cache({ ok: response.ok, checkedAt: new Date().toISOString(), mode, provider: "the-odds-api", monthlyLimit: MONTHLY_LIMIT, safeStop: SAFE_STOP, dailyBudget: DAILY_BUDGET, used, remaining, lastRequestCost, exhausted: state.exhausted, safeStopped: state.safeStopped, status: state.status, details });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return cache({ ok: false, checkedAt: new Date().toISOString(), mode: "error", provider: "the-odds-api", monthlyLimit: MONTHLY_LIMIT, safeStop: SAFE_STOP, dailyBudget: DAILY_BUDGET, used: cached?.used ?? null, remaining: cached?.remaining ?? null, lastRequestCost: cached?.lastRequestCost ?? null, exhausted: cached?.exhausted ?? null, safeStopped: cached?.safeStopped ?? null, status: "ERROR", details: message });
  }
}
