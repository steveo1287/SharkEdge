import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

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
  source?: "real" | "override" | "synthetic";
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
  offRtg?: number;
  defRtg?: number;
  pace?: number;
  efg?: number;
  efgPct?: number;
  threePointRate?: number;
  threePointAttemptRate?: number;
  tovPct?: number;
  turnoverPct?: number;
  rebPct?: number;
  reboundPct?: number;
  ftr?: number;
  freeThrowRate?: number;
  form?: number;
  recentForm?: number;
  restTravel?: number;
};

const NBA_STATS_CACHE_KEY = "nba:team-analytics:real-feed:v1";
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

function normalizeRawProfile(raw: RawNbaTeamStats): NbaTeamAnalyticsProfile | null {
  const teamName = raw.teamName ?? raw.team ?? raw.name;
  if (!teamName) return null;
  const fallback = syntheticProfile(teamName);
  return {
    teamName,
    offensiveRating: num(raw.offensiveRating, raw.offRtg) ?? fallback.offensiveRating,
    defensiveRating: num(raw.defensiveRating, raw.defRtg) ?? fallback.defensiveRating,
    pace: num(raw.pace) ?? fallback.pace,
    efgPct: num(raw.efgPct, raw.efg) ?? fallback.efgPct,
    threePointAttemptRate: num(raw.threePointAttemptRate, raw.threePointRate) ?? fallback.threePointAttemptRate,
    turnoverPct: num(raw.turnoverPct, raw.tovPct) ?? fallback.turnoverPct,
    reboundPct: num(raw.reboundPct, raw.rebPct) ?? fallback.reboundPct,
    freeThrowRate: num(raw.freeThrowRate, raw.ftr) ?? fallback.freeThrowRate,
    recentForm: num(raw.recentForm, raw.form) ?? fallback.recentForm,
    restTravel: num(raw.restTravel) ?? fallback.restTravel,
    source: "real"
  };
}

async function fetchRealProfiles() {
  const configuredUrl = process.env.NBA_TEAM_STATS_URL?.trim();
  if (!configuredUrl) return null;

  const cached = await readHotCache<Record<string, NbaTeamAnalyticsProfile>>(NBA_STATS_CACHE_KEY);
  if (cached) return cached;

  try {
    const response = await fetch(configuredUrl, { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    const rows: RawNbaTeamStats[] = Array.isArray(body) ? body : Array.isArray(body?.teams) ? body.teams : [];
    const profiles: Record<string, NbaTeamAnalyticsProfile> = {};
    for (const row of rows) {
      const profile = normalizeRawProfile(row);
      if (profile) profiles[normalizeNbaTeam(profile.teamName)] = profile;
    }
    if (Object.keys(profiles).length) {
      await writeHotCache(NBA_STATS_CACHE_KEY, profiles, NBA_STATS_CACHE_TTL_SECONDS);
      return profiles;
    }
  } catch {
    return null;
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
