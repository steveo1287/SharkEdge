import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbAnalyticsRows, rowsFromMlbAnalyticsBody, type MlbAnalyticsPipelineTeam } from "@/services/simulation/mlb-analytics-pipeline";

const CACHE_KEY = "mlb:analytics:pipeline:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 18;

async function fetchJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`MLB analytics upstream failed: ${response.status}`);
  return response.json();
}

export async function readCachedMlbAnalytics() {
  return readHotCache<MlbAnalyticsPipelineTeam[]>(CACHE_KEY);
}

export async function refreshMlbAnalyticsCache() {
  const url = process.env.MLB_RAW_TEAM_STATS_URL?.trim() || process.env.MLB_STATS_PIPELINE_URL?.trim();
  if (!url) {
    return { ok: false, source: "missing-upstream", teams: [] as MlbAnalyticsPipelineTeam[], message: "Set MLB_RAW_TEAM_STATS_URL or MLB_STATS_PIPELINE_URL." };
  }
  const body = await fetchJson(url);
  const teams = normalizeMlbAnalyticsRows(rowsFromMlbAnalyticsBody(body));
  if (!teams.length) {
    return { ok: false, source: url, teams, message: "Upstream returned no normalizable MLB team rows." };
  }
  await writeHotCache(CACHE_KEY, teams, CACHE_TTL_SECONDS);
  return { ok: true, source: url, teams, message: `Cached ${teams.length} MLB team profiles.` };
}
