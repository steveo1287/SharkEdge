import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { NbaTeamAnalyticsProfile } from "@/services/simulation/nba-team-analytics";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

// Fetches real NBA team advanced stats from the public NBA Stats API.
// No API key required — uses required browser-like headers.
// Data: ORTG, DRTG, PACE, EFG_PCT, TM_TOV_PCT, OREB_PCT, FTA_RATE, NET_RATING
const CACHE_KEY = "nba:stats-api:team-advanced:v2";
const CACHE_TTL_SECONDS = 60 * 60 * 6; // 6-hour refresh

const NBA_STATS_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Referer": "https://www.nba.com/",
  "Origin": "https://www.nba.com",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "x-nba-stats-origin": "stats",
  "x-nba-stats-token": "true"
};

// NBA team name → normalized key mappings for stats.nba.com display names
const NBA_DISPLAY_NAME_MAP: Record<string, string> = {
  "atlanta hawks": "atlantahawks",
  "boston celtics": "bostonceltics",
  "brooklyn nets": "brooklynnets",
  "charlotte hornets": "charlottehornets",
  "chicago bulls": "chicagobulls",
  "cleveland cavaliers": "clevelandcavaliers",
  "dallas mavericks": "dallasmavericks",
  "denver nuggets": "denvernuggets",
  "detroit pistons": "detroitpistons",
  "golden state warriors": "goldenstatewarriors",
  "houston rockets": "houstonrockets",
  "indiana pacers": "indianapacers",
  "los angeles clippers": "losangelesclippers",
  "los angeles lakers": "losangeleslakers",
  "memphis grizzlies": "memphisgrizzlies",
  "miami heat": "miamiheat",
  "milwaukee bucks": "milwaukeebucks",
  "minnesota timberwolves": "minnesotatimberwolves",
  "new orleans pelicans": "neworleanspelicans",
  "new york knicks": "newyorkknicks",
  "oklahoma city thunder": "oklahomacitythunder",
  "orlando magic": "orlandomagic",
  "philadelphia 76ers": "philadelphia76ers",
  "phoenix suns": "phoenixsuns",
  "portland trail blazers": "portlandtrailblazers",
  "sacramento kings": "sacramentokings",
  "san antonio spurs": "sanantoniospurs",
  "toronto raptors": "torontoraptors",
  "utah jazz": "utahjazz",
  "washington wizards": "washingtonwizards"
};

function num(value: unknown, fallback?: number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback ?? null;
}

function safePercent(value: number | null): number | null {
  if (value === null) return null;
  // Convert 0-1 decimals to percent
  return value <= 1 ? value * 100 : value;
}

function rowsetsToObjects(resultSet: { headers: string[]; rowSet: unknown[][] }): Record<string, unknown>[] {
  const { headers, rowSet } = resultSet;
  return rowSet.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}

async function fetchAdvancedStats(season: string): Promise<Record<string, NbaTeamAnalyticsProfile> | null> {
  const url = new URL("https://stats.nba.com/stats/leaguedashteamstats");
  url.searchParams.set("Season", season);
  url.searchParams.set("SeasonType", "Regular Season");
  url.searchParams.set("PerMode", "PerGame");
  url.searchParams.set("MeasureType", "Advanced");
  url.searchParams.set("PaceAdjust", "N");
  url.searchParams.set("LastNGames", "0");
  url.searchParams.set("Month", "0");
  url.searchParams.set("OpponentTeamID", "0");
  url.searchParams.set("PORound", "0");

  const res = await fetch(url.toString(), { headers: NBA_STATS_HEADERS, cache: "no-store" });
  if (!res.ok) return null;
  const json = await res.json() as { resultSets?: Array<{ headers: string[]; rowSet: unknown[][] }> };
  const resultSet = json.resultSets?.[0];
  if (!resultSet) return null;

  const rows = rowsetsToObjects(resultSet);
  const result: Record<string, NbaTeamAnalyticsProfile> = {};

  for (const row of rows) {
    const rawName = String(row.TEAM_NAME ?? "").trim();
    if (!rawName) continue;
    const key = NBA_DISPLAY_NAME_MAP[rawName.toLowerCase()] ?? normalizeNbaTeam(rawName);
    result[key] = {
      teamName: rawName,
      offensiveRating: num(row.OFF_RATING) ?? 113,
      defensiveRating: num(row.DEF_RATING) ?? 113,
      pace: num(row.PACE) ?? 99.5,
      efgPct: safePercent(num(row.EFG_PCT)) ?? 54.5,
      threePointAttemptRate: safePercent(num(row.PCT_FGA_3PT ?? row.FG3A_FREQUENCY)) ?? 38,
      turnoverPct: safePercent(num(row.TM_TOV_PCT)) ?? 13,
      reboundPct: safePercent(num(row.OREB_PCT)) ?? 25,
      freeThrowRate: safePercent(num(row.FTA_RATE)) ?? 22,
      recentForm: num(row.NET_RATING) ?? 0,
      restTravel: 0,
      source: "nba-stats-api"
    };
  }

  return Object.keys(result).length ? result : null;
}

async function fetchFourFactors(season: string): Promise<Record<string, Partial<NbaTeamAnalyticsProfile>> | null> {
  const url = new URL("https://stats.nba.com/stats/leaguedashteamstats");
  url.searchParams.set("Season", season);
  url.searchParams.set("SeasonType", "Regular Season");
  url.searchParams.set("PerMode", "PerGame");
  url.searchParams.set("MeasureType", "Four Factors");
  url.searchParams.set("LastNGames", "0");
  url.searchParams.set("Month", "0");
  url.searchParams.set("OpponentTeamID", "0");

  try {
    const res = await fetch(url.toString(), { headers: NBA_STATS_HEADERS, cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json() as { resultSets?: Array<{ headers: string[]; rowSet: unknown[][] }> };
    const resultSet = json.resultSets?.[0];
    if (!resultSet) return null;
    const rows = rowsetsToObjects(resultSet);
    const result: Record<string, Partial<NbaTeamAnalyticsProfile>> = {};
    for (const row of rows) {
      const rawName = String(row.TEAM_NAME ?? "").trim();
      if (!rawName) continue;
      const key = NBA_DISPLAY_NAME_MAP[rawName.toLowerCase()] ?? normalizeNbaTeam(rawName);
      result[key] = {
        efgPct: safePercent(num(row.EFG_PCT)) ?? undefined,
        turnoverPct: safePercent(num(row.TM_TOV_PCT)) ?? undefined,
        reboundPct: safePercent(num(row.OREB_PCT)) ?? undefined,
        freeThrowRate: safePercent(num(row.FTA_RATE)) ?? undefined
      };
    }
    return Object.keys(result).length ? result : null;
  } catch {
    return null;
  }
}

export async function fetchNbaStatsApiTeamProfiles(): Promise<Record<string, NbaTeamAnalyticsProfile> | null> {
  const cached = await readHotCache<Record<string, NbaTeamAnalyticsProfile>>(CACHE_KEY);
  if (cached) return cached;

  const season = process.env.NBA_STATS_SEASON?.trim() ?? "2024-25";
  try {
    const [advanced, fourFactors] = await Promise.all([
      fetchAdvancedStats(season),
      fetchFourFactors(season)
    ]);

    if (!advanced) return null;

    // Merge four factors into advanced stats where available
    if (fourFactors) {
      for (const [key, profile] of Object.entries(advanced)) {
        const ff = fourFactors[key];
        if (!ff) continue;
        if (ff.efgPct != null) profile.efgPct = ff.efgPct;
        if (ff.turnoverPct != null) profile.turnoverPct = ff.turnoverPct;
        if (ff.reboundPct != null) profile.reboundPct = ff.reboundPct;
        if (ff.freeThrowRate != null) profile.freeThrowRate = ff.freeThrowRate;
      }
    }

    await writeHotCache(CACHE_KEY, advanced, CACHE_TTL_SECONDS);
    return advanced;
  } catch {
    return null;
  }
}
