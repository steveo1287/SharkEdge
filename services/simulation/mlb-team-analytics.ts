import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { fetchRawFeedRows, pick } from "@/services/mlb/raw-feed-parser";
import { normalizeTeamKey } from "@/lib/utils/team-normalization";
import { getMlbRestMatchup } from "@/services/simulation/mlb-schedule-rest-service";
import { getMlbLiveTeamProfile } from "@/services/simulation/mlb-live-stats-feed";

export type MlbTeamProfile = {
  teamName: string;
  source: "real" | "synthetic";
  wrcPlus: number;
  xwoba: number;
  isoPower: number;
  kRate: number;
  bbRate: number;
  babip: number;
  baseRunning: number;
  starterEraMinus: number;
  starterXFip: number;
  bullpenEraMinus: number;
  bullpenXFip: number;
  bullpenFatigue: number;
  defensiveRunsSaved: number;
  parkRunFactor: number;
  weatherRunFactor: number;
  recentForm: number;
  travelRest: number;
};

export type MlbMatchupComparison = {
  away: MlbTeamProfile;
  home: MlbTeamProfile;
  offensiveEdge: number;
  powerEdge: number;
  plateDisciplineEdge: number;
  startingPitchingEdge: number;
  bullpenEdge: number;
  defenseEdge: number;
  parkWeatherEdge: number;
  fatigueEdge: number;
  formEdge: number;
  runEnvironment: number;
  volatilityIndex: number;
};

type RawMlbTeam = Partial<MlbTeamProfile> & { team?: string; name?: string; team_name?: string };
const CACHE_KEY = "mlb:team-analytics:v2";
const CACHE_TTL_SECONDS = 60 * 60 * 6;

export function normalizeMlbTeam(value: string) {
  return normalizeTeamKey(value, {
    whitesox: "chicagowhitesox",
    redsox: "bostonredsox",
    bluejays: "torontobluejays",
    diamondbacks: "arizonadiamondbacks"
  });
}

function hashString(value: string) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0; return hash; }
function seedUnit(seed: number) { return (seed % 1000) / 1000; }
function range(seed: number, min: number, max: number) { return Number((min + seedUnit(seed) * (max - min)).toFixed(2)); }
function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value); return fallback; }
function teamName(row: RawMlbTeam) { return pick(row, "teamName", "team", "team_name", "name", "Team", "Tm") as string | null ?? null; }

function syntheticProfile(teamName: string): MlbTeamProfile {
  const seed = hashString(`${teamName}:mlb-team-profile`);
  return {
    teamName,
    source: "synthetic",
    wrcPlus: range(seed >>> 1, 84, 121),
    xwoba: range(seed >>> 2, 0.29, 0.35),
    isoPower: range(seed >>> 3, 0.13, 0.2),
    kRate: range(seed >>> 4, 18, 28),
    bbRate: range(seed >>> 5, 6, 11),
    babip: range(seed >>> 6, 0.27, 0.32),
    baseRunning: range(seed >>> 7, -4, 6),
    starterEraMinus: range(seed >>> 8, 78, 122),
    starterXFip: range(seed >>> 9, 3.35, 4.75),
    bullpenEraMinus: range(seed >>> 10, 78, 125),
    bullpenXFip: range(seed >>> 11, 3.25, 4.95),
    bullpenFatigue: range(seed >>> 12, 0, 1),
    defensiveRunsSaved: range(seed >>> 13, -12, 18),
    parkRunFactor: range(seed >>> 14, 0.9, 1.12),
    weatherRunFactor: range(seed >>> 15, 0.9, 1.16),
    recentForm: range(seed >>> 16, -5, 6),
    travelRest: range(seed >>> 17, -2, 2)
  };
}

function normalizeRaw(row: RawMlbTeam): MlbTeamProfile | null {
  const name = teamName(row);
  if (!name) return null;
  const base = syntheticProfile(name);
  return {
    ...base,
    source: "real",
    wrcPlus: num(pick(row, "wrcPlus", "wRC+", "WRC_PLUS"), base.wrcPlus),
    xwoba: num(pick(row, "xwoba", "xwOBA", "wOBA", "woba"), base.xwoba),
    isoPower: num(pick(row, "isoPower", "ISO", "iso"), base.isoPower),
    kRate: num(pick(row, "kRate", "K%", "K_PCT", "k_pct"), base.kRate),
    bbRate: num(pick(row, "bbRate", "BB%", "BB_PCT", "bb_pct"), base.bbRate),
    babip: num(pick(row, "babip", "BABIP"), base.babip),
    baseRunning: num(pick(row, "baseRunning", "BsR", "baserunning"), base.baseRunning),
    starterEraMinus: num(pick(row, "starterEraMinus", "starter_era_minus", "SP_ERA-", "rotationEraMinus"), base.starterEraMinus),
    starterXFip: num(pick(row, "starterXFip", "starter_xfip", "SP_xFIP", "rotationXFip"), base.starterXFip),
    bullpenEraMinus: num(pick(row, "bullpenEraMinus", "bullpen_era_minus", "RP_ERA-", "reliefEraMinus"), base.bullpenEraMinus),
    bullpenXFip: num(pick(row, "bullpenXFip", "bullpen_xfip", "RP_xFIP", "reliefXFip"), base.bullpenXFip),
    bullpenFatigue: num(pick(row, "bullpenFatigue", "bullpen_fatigue"), base.bullpenFatigue),
    defensiveRunsSaved: num(pick(row, "defensiveRunsSaved", "DRS", "OAA", "Def"), base.defensiveRunsSaved),
    parkRunFactor: num(pick(row, "parkRunFactor", "park_factor", "ParkFactor"), base.parkRunFactor),
    weatherRunFactor: num(pick(row, "weatherRunFactor", "weather_factor"), base.weatherRunFactor),
    recentForm: num(pick(row, "recentForm", "recent_form"), base.recentForm),
    travelRest: num(pick(row, "travelRest", "travel_rest"), base.travelRest)
  };
}

function rowsFromBody(body: any): RawMlbTeam[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.teams)) return body.teams; if (Array.isArray(body?.data)) return body.data; return []; }

async function fetchProfiles() {
  const cached = await readHotCache<Record<string, MlbTeamProfile>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.MLB_TEAM_ANALYTICS_URL?.trim();
  if (!url) return null;
  try {
    const grouped: Record<string, MlbTeamProfile> = {};
    for (const row of await fetchRawFeedRows(url, ["teams", "data", "rows"])) {
      const profile = normalizeRaw(row);
      if (profile) grouped[normalizeMlbTeam(profile.teamName)] = profile;
    }
    if (Object.keys(grouped).length) {
      await writeHotCache(CACHE_KEY, grouped, CACHE_TTL_SECONDS);
      return grouped;
    }
  } catch {
    return null;
  }
  return null;
}

export async function getMlbTeamProfile(teamName: string): Promise<MlbTeamProfile> {
  const profiles = await fetchProfiles();
  if (profiles?.[normalizeMlbTeam(teamName)]) return profiles[normalizeMlbTeam(teamName)];
  // Fallback: derive real stats from free MLB Stats API before going synthetic
  const live = await getMlbLiveTeamProfile(teamName).catch(() => null);
  return live ?? syntheticProfile(teamName);
}

export async function compareMlbProfiles(awayTeam: string, homeTeam: string): Promise<MlbMatchupComparison> {
  const [[away, home], restMatchup] = await Promise.all([
    Promise.all([getMlbTeamProfile(awayTeam), getMlbTeamProfile(homeTeam)]),
    getMlbRestMatchup(awayTeam, homeTeam)
  ]);
  // Override travelRest with live schedule data when available
  if (restMatchup.source === "real") {
    away.travelRest = restMatchup.awayRest.travelRest;
    home.travelRest = restMatchup.homeRest.travelRest;
  }
  const offensiveEdge = Number((((home.wrcPlus - away.wrcPlus) / 10) + (home.xwoba - away.xwoba) * 55).toFixed(2));
  const powerEdge = Number(((home.isoPower - away.isoPower) * 45).toFixed(2));
  const plateDisciplineEdge = Number((((away.kRate - home.kRate) + (home.bbRate - away.bbRate)) / 4).toFixed(2));
  const startingPitchingEdge = Number((((away.starterEraMinus - home.starterEraMinus) / 9) + (away.starterXFip - home.starterXFip) * 0.9).toFixed(2));
  const bullpenEdge = Number((((away.bullpenEraMinus - home.bullpenEraMinus) / 10) + (away.bullpenXFip - home.bullpenXFip) * 0.7 + (away.bullpenFatigue - home.bullpenFatigue) * 1.5).toFixed(2));
  const defenseEdge = Number(((home.defensiveRunsSaved - away.defensiveRunsSaved) / 8).toFixed(2));
  const parkWeatherEdge = Number((((home.parkRunFactor + home.weatherRunFactor) / 2 - 1) * 8).toFixed(2));
  const fatigueEdge = Number((home.travelRest - away.travelRest).toFixed(2));
  const formEdge = Number(((home.recentForm - away.recentForm) / 3).toFixed(2));
  const runEnvironment = Number((4.45 + parkWeatherEdge * 0.28 + (home.wrcPlus + away.wrcPlus - 200) / 45 + (home.bullpenFatigue + away.bullpenFatigue) * 0.35).toFixed(2));
  const volatilityIndex = Number(Math.max(0.7, Math.min(1.7, 1 + Math.abs(powerEdge) / 12 + (home.bullpenFatigue + away.bullpenFatigue) / 6 + Math.abs(parkWeatherEdge) / 10)).toFixed(2));
  return { away, home, offensiveEdge, powerEdge, plateDisciplineEdge, startingPitchingEdge, bullpenEdge, defenseEdge, parkWeatherEdge, fatigueEdge, formEdge, runEnvironment, volatilityIndex };
}
