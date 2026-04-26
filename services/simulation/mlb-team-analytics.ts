import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

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
const CACHE_KEY = "mlb:team-analytics:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 6;

export function normalizeMlbTeam(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function hashString(value: string) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0; return hash; }
function seedUnit(seed: number) { return (seed % 1000) / 1000; }
function range(seed: number, min: number, max: number) { return Number((min + seedUnit(seed) * (max - min)).toFixed(2)); }
function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value); return fallback; }
function teamName(row: RawMlbTeam) { return row.teamName ?? row.team ?? row.team_name ?? row.name ?? null; }

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
    wrcPlus: num(row.wrcPlus, base.wrcPlus),
    xwoba: num(row.xwoba, base.xwoba),
    isoPower: num(row.isoPower, base.isoPower),
    kRate: num(row.kRate, base.kRate),
    bbRate: num(row.bbRate, base.bbRate),
    babip: num(row.babip, base.babip),
    baseRunning: num(row.baseRunning, base.baseRunning),
    starterEraMinus: num(row.starterEraMinus, base.starterEraMinus),
    starterXFip: num(row.starterXFip, base.starterXFip),
    bullpenEraMinus: num(row.bullpenEraMinus, base.bullpenEraMinus),
    bullpenXFip: num(row.bullpenXFip, base.bullpenXFip),
    bullpenFatigue: num(row.bullpenFatigue, base.bullpenFatigue),
    defensiveRunsSaved: num(row.defensiveRunsSaved, base.defensiveRunsSaved),
    parkRunFactor: num(row.parkRunFactor, base.parkRunFactor),
    weatherRunFactor: num(row.weatherRunFactor, base.weatherRunFactor),
    recentForm: num(row.recentForm, base.recentForm),
    travelRest: num(row.travelRest, base.travelRest)
  };
}

function rowsFromBody(body: any): RawMlbTeam[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.teams)) return body.teams; if (Array.isArray(body?.data)) return body.data; return []; }

async function fetchProfiles() {
  const cached = await readHotCache<Record<string, MlbTeamProfile>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.MLB_TEAM_ANALYTICS_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const grouped: Record<string, MlbTeamProfile> = {};
    for (const row of rowsFromBody(await response.json())) {
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
  return profiles?.[normalizeMlbTeam(teamName)] ?? syntheticProfile(teamName);
}

export async function compareMlbProfiles(awayTeam: string, homeTeam: string): Promise<MlbMatchupComparison> {
  const [away, home] = await Promise.all([getMlbTeamProfile(awayTeam), getMlbTeamProfile(homeTeam)]);
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
