import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { fetchNbaStatsApiTeamProfiles } from "@/services/simulation/nba-stats-api-team-feed";
import { fetchNbaScheduleContextAll } from "@/services/simulation/nba-espn-schedule-feed";

export type NbaTeamAnalyticsProfile = {
  teamName: string;
  offensiveRating: number;
  defensiveRating: number;
  pace: number;
  efgPct: number;
  threePointAttemptRate: number;
  turnoverPct: number;
  reboundPct: number;
  freeThrowRate: number;
  recentForm: number;
  restTravel: number;
  source?: "nba-stats-api" | "sportsdataverse" | "real" | "override" | "synthetic";
};

export type NbaMatchupComparison = {
  away: NbaTeamAnalyticsProfile;
  home: NbaTeamAnalyticsProfile;
  offensiveEdge: number;
  defensiveEdge: number;
  paceAverage: number;
  efgEdge: number;
  threePointVolatility: number;
  turnoverEdge: number;
  reboundEdge: number;
  freeThrowEdge: number;
  restTravelEdge: number;
  formEdge: number;
};

type RawNbaTeamStats = Partial<NbaTeamAnalyticsProfile> & {
  team?: string;
  name?: string;
  teamName?: string;
  team_name?: string;
  display_name?: string;
  offRtg?: number;
  off_rating?: number;
  offensive_rating?: number;
  OFF_RATING?: number;
  defRtg?: number;
  def_rating?: number;
  defensive_rating?: number;
  DEF_RATING?: number;
  pace?: number;
  PACE?: number;
  efg?: number;
  efgPct?: number;
  efg_pct?: number;
  EFG_PCT?: number;
  threePointRate?: number;
  threePointAttemptRate?: number;
  fg3a_rate?: number;
  three_pa_rate?: number;
  tovPct?: number;
  turnoverPct?: number;
  tov_pct?: number;
  TM_TOV_PCT?: number;
  rebPct?: number;
  reboundPct?: number;
  reb_pct?: number;
  REB_PCT?: number;
  ftr?: number;
  freeThrowRate?: number;
  ft_rate?: number;
  FTA_RATE?: number;
  form?: number;
  recentForm?: number;
  recent_form?: number;
  restTravel?: number;
  rest_travel?: number;
};

const NBA_STATS_CACHE_KEY = "nba:team-analytics:merged-feed:v2";
const NBA_STATS_CACHE_TTL_SECONDS = 60 * 60 * 12;

export function normalizeNbaTeam(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function seedUnit(seed: number) {
  return (seed % 1000) / 1000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(2));
}

function num(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function asPercent(value: number | null, fallback: number) {
  if (value === null) return fallback;
  return value <= 1 ? Number((value * 100).toFixed(2)) : value;
}

const TEAM_OVERRIDES: Record<string, Partial<NbaTeamAnalyticsProfile>> = {
  bostonceltics: { offensiveRating: 120.2, defensiveRating: 110.1, pace: 98.1, efgPct: 57.5, threePointAttemptRate: 47.1, reboundPct: 51.6, recentForm: 4.2 },
  oklahomacitythunder: { offensiveRating: 119.1, defensiveRating: 108.9, pace: 99.7, efgPct: 56.3, turnoverPct: 11.2, recentForm: 4.5 },
  denvernuggets: { offensiveRating: 118.4, defensiveRating: 113.2, pace: 97.4, efgPct: 57.1, turnoverPct: 12.1, reboundPct: 52.4, recentForm: 3.4 },
  minnesotatimberwolves: { offensiveRating: 115.7, defensiveRating: 109.8, pace: 97.9, efgPct: 55.1, reboundPct: 51.8, recentForm: 3.2 },
  newyorkknicks: { offensiveRating: 117.3, defensiveRating: 113.0, pace: 96.3, reboundPct: 52.7, turnoverPct: 11.9, recentForm: 2.9 },
  milwaukeebucks: { offensiveRating: 117.9, defensiveRating: 115.4, pace: 99.2, efgPct: 56.4, freeThrowRate: 24.1, recentForm: 2.6 },
  clevelandcavaliers: { offensiveRating: 116.4, defensiveRating: 111.4, pace: 97.8, efgPct: 56.1, recentForm: 3.1 },
  dallasmavericks: { offensiveRating: 117.2, defensiveRating: 115.6, pace: 98.7, threePointAttemptRate: 43.2, recentForm: 2.8 },
  phoenixsuns: { offensiveRating: 116.9, defensiveRating: 114.9, pace: 98.2, efgPct: 56.0, freeThrowRate: 23.8, recentForm: 2.3 },
  losangeleslakers: { offensiveRating: 115.9, defensiveRating: 114.8, pace: 100.1, freeThrowRate: 25.2, reboundPct: 50.2, recentForm: 2.2 },
  goldenswarriors: { offensiveRating: 115.2, defensiveRating: 113.6, pace: 100.3, threePointAttemptRate: 46.8, efgPct: 55.4, recentForm: 2.1 },
  chicagobulls: { offensiveRating: 113.1, defensiveRating: 116.1, pace: 99.4, efgPct: 53.5, turnoverPct: 12.5, recentForm: -0.4 },
  detroitpistons: { offensiveRating: 112.4, defensiveRating: 117.0, pace: 100.4, turnoverPct: 13.9, recentForm: -0.8 },
  washingtonwizards: { offensiveRating: 110.8, defensiveRating: 119.4, pace: 101.1, turnoverPct: 14.4, recentForm: -2.4 }
};

function syntheticProfile(teamName: string): NbaTeamAnalyticsProfile {
  const key = normalizeNbaTeam(teamName);
  const seed = hashString(key);
  const synthetic: NbaTeamAnalyticsProfile = {
    teamName,
    offensiveRating: range(seed >>> 1, 111.0, 118.8),
    defensiveRating: range(seed >>> 2, 110.2, 117.8),
    pace: range(seed >>> 3, 96.2, 101.5),
    efgPct: range(seed >>> 4, 52.8, 57.2),
    threePointAttemptRate: range(seed >>> 5, 34.0, 47.5),
    turnoverPct: range(seed >>> 6, 11.0, 14.8),
    reboundPct: range(seed >>> 7, 48.2, 53.0),
    freeThrowRate: range(seed >>> 8, 18.2, 25.5),
    recentForm: range(seed >>> 9, -3.5, 4.5),
    restTravel: range(seed >>> 10, -2.5, 2.8),
    source: "synthetic"
  };
  const override = TEAM_OVERRIDES[key];
  return override ? { ...synthetic, ...override, source: "override" } : synthetic;
}

function normalizeRawProfile(raw: RawNbaTeamStats, source: NbaTeamAnalyticsProfile["source"]): NbaTeamAnalyticsProfile | null {
  const teamName = raw.teamName ?? raw.team ?? raw.name ?? raw.team_name ?? raw.display_name;
  if (!teamName) return null;
  const fallback = syntheticProfile(teamName);
  return {
    teamName,
    offensiveRating: num(raw.offensiveRating, raw.offRtg, raw.off_rating, raw.offensive_rating, raw.OFF_RATING) ?? fallback.offensiveRating,
    defensiveRating: num(raw.defensiveRating, raw.defRtg, raw.def_rating, raw.defensive_rating, raw.DEF_RATING) ?? fallback.defensiveRating,
    pace: num(raw.pace, raw.PACE) ?? fallback.pace,
    efgPct: asPercent(num(raw.efgPct, raw.efg, raw.efg_pct, raw.EFG_PCT), fallback.efgPct),
    threePointAttemptRate: asPercent(num(raw.threePointAttemptRate, raw.threePointRate, raw.fg3a_rate, raw.three_pa_rate), fallback.threePointAttemptRate),
    turnoverPct: asPercent(num(raw.turnoverPct, raw.tovPct, raw.tov_pct, raw.TM_TOV_PCT), fallback.turnoverPct),
    reboundPct: asPercent(num(raw.reboundPct, raw.rebPct, raw.reb_pct, raw.REB_PCT), fallback.reboundPct),
    freeThrowRate: asPercent(num(raw.freeThrowRate, raw.ftr, raw.ft_rate, raw.FTA_RATE), fallback.freeThrowRate),
    recentForm: num(raw.recentForm, raw.form, raw.recent_form) ?? fallback.recentForm,
    restTravel: num(raw.restTravel, raw.rest_travel) ?? fallback.restTravel,
    source
  };
}

function rowsFromBody(body: any): RawNbaTeamStats[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.teams)) return body.teams;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.resultSets?.[0]?.rowSet) && Array.isArray(body?.resultSets?.[0]?.headers)) {
    const headers = body.resultSets[0].headers;
    return body.resultSets[0].rowSet.map((row: unknown[]) => Object.fromEntries(headers.map((header: string, index: number) => [header, row[index]])));
  }
  return [];
}

async function fetchProfilesFromUrl(url: string | undefined, source: NbaTeamAnalyticsProfile["source"]) {
  if (!url?.trim()) return {} as Record<string, NbaTeamAnalyticsProfile>;
  try {
    const response = await fetch(url.trim(), { cache: "no-store" });
    if (!response.ok) return {};
    const body = await response.json();
    const profiles: Record<string, NbaTeamAnalyticsProfile> = {};
    for (const row of rowsFromBody(body)) {
      const profile = normalizeRawProfile(row, source);
      if (profile) profiles[normalizeNbaTeam(profile.teamName)] = profile;
    }
    return profiles;
  } catch {
    return {};
  }
}

async function fetchRealProfiles() {
  const cached = await readHotCache<Record<string, NbaTeamAnalyticsProfile>>(NBA_STATS_CACHE_KEY);
  if (cached) return cached;

  const [sportsDataverse, nbaStatsApiEnv, generic, nbaStatsApiComputed, scheduleContexts] = await Promise.all([
    fetchProfilesFromUrl(process.env.SPORTSDATAVERSE_NBA_TEAM_STATS_URL, "sportsdataverse"),
    fetchProfilesFromUrl(process.env.NBA_STATS_API_TEAM_STATS_URL, "nba-stats-api"),
    fetchProfilesFromUrl(process.env.NBA_TEAM_STATS_URL, "real"),
    // Always-on: pull real team efficiency from stats.nba.com (no key needed)
    fetchNbaStatsApiTeamProfiles().catch(() => null),
    // Always-on: pull real rest/form from ESPN schedule (no key needed)
    fetchNbaScheduleContextAll().catch(() => null)
  ]);

  // Merge in priority order — configured env feeds override computed data
  const merged: Record<string, NbaTeamAnalyticsProfile> = {
    ...nbaStatsApiComputed ?? {},
    ...generic,
    ...sportsDataverse,
    ...nbaStatsApiEnv
  };

  // Overlay real rest/form from ESPN schedule data
  if (scheduleContexts) {
    for (const [key, ctx] of Object.entries(scheduleContexts)) {
      if (merged[key]) {
        merged[key] = {
          ...merged[key],
          restTravel: ctx.restTravelEdge,
          recentForm: Number((merged[key].recentForm * 0.5 + ctx.recentFormEdge * 0.5).toFixed(2))
        };
      }
    }
  }

  if (Object.keys(merged).length) {
    await writeHotCache(NBA_STATS_CACHE_KEY, merged, NBA_STATS_CACHE_TTL_SECONDS);
    return merged;
  }
  return null;
}

export function getNbaTeamAnalyticsProfile(teamName: string): NbaTeamAnalyticsProfile {
  return syntheticProfile(teamName);
}

export async function getNbaTeamAnalyticsProfileReal(teamName: string): Promise<NbaTeamAnalyticsProfile> {
  const realProfiles = await fetchRealProfiles();
  const real = realProfiles?.[normalizeNbaTeam(teamName)];
  return real ?? syntheticProfile(teamName);
}

function compareProfiles(away: NbaTeamAnalyticsProfile, home: NbaTeamAnalyticsProfile): NbaMatchupComparison {
  return {
    away,
    home,
    offensiveEdge: home.offensiveRating - away.offensiveRating,
    defensiveEdge: away.defensiveRating - home.defensiveRating,
    paceAverage: (away.pace + home.pace) / 2,
    efgEdge: home.efgPct - away.efgPct,
    threePointVolatility: (away.threePointAttemptRate + home.threePointAttemptRate) / 80,
    turnoverEdge: away.turnoverPct - home.turnoverPct,
    reboundEdge: home.reboundPct - away.reboundPct,
    freeThrowEdge: home.freeThrowRate - away.freeThrowRate,
    restTravelEdge: home.restTravel - away.restTravel,
    formEdge: home.recentForm - away.recentForm
  };
}

export function compareNbaProfiles(awayTeam: string, homeTeam: string): NbaMatchupComparison {
  return compareProfiles(getNbaTeamAnalyticsProfile(awayTeam), getNbaTeamAnalyticsProfile(homeTeam));
}

export async function compareNbaProfilesReal(awayTeam: string, homeTeam: string): Promise<NbaMatchupComparison> {
  const [away, home] = await Promise.all([
    getNbaTeamAnalyticsProfileReal(awayTeam),
    getNbaTeamAnalyticsProfileReal(homeTeam)
  ]);
  return compareProfiles(away, home);
}
