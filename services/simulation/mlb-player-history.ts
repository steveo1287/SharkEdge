import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

export type MlbPlayerHistoryProfile = {
  teamName: string;
  source: "real" | "synthetic";
  batterVsStarterEdge: number;
  pitcherVsLineupEdge: number;
  recentHitterForm: number;
  recentPitcherForm: number;
  bullpenRecentForm: number;
  platoonHistoryEdge: number;
  clutchRecentEdge: number;
  strikeoutWalkTrend: number;
  hardContactTrend: number;
  baseRunningTrend: number;
  historySample: number;
};

export type MlbPlayerHistoryComparison = {
  away: MlbPlayerHistoryProfile;
  home: MlbPlayerHistoryProfile;
  historyEdge: number;
  hitterHistoryEdge: number;
  pitcherHistoryEdge: number;
  recentFormEdge: number;
  bullpenHistoryEdge: number;
  platoonHistoryEdge: number;
  contactTrendEdge: number;
  historyConfidence: number;
  factors: Array<{ label: string; value: number }>;
};

type RawHistory = Record<string, unknown>;
const CACHE_KEY = "mlb:player-history:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 3;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seedUnit(seed: number) {
  return (seed % 10000) / 10000;
}

function range(seed: number, min: number, max: number) {
  return Number((min + seedUnit(seed) * (max - min)).toFixed(2));
}

function num(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function rowsFromBody(body: unknown): RawHistory[] {
  const value = body as { teams?: RawHistory[]; players?: RawHistory[]; history?: RawHistory[]; data?: RawHistory[]; rows?: RawHistory[] };
  if (Array.isArray(body)) return body as RawHistory[];
  if (Array.isArray(value.teams)) return value.teams;
  if (Array.isArray(value.players)) return value.players;
  if (Array.isArray(value.history)) return value.history;
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.rows)) return value.rows;
  return [];
}

function syntheticProfile(teamName: string): MlbPlayerHistoryProfile {
  const seed = hashString(`${teamName}:mlb-player-history`);
  return {
    teamName,
    source: "synthetic",
    batterVsStarterEdge: range(seed >>> 1, -2.2, 2.4),
    pitcherVsLineupEdge: range(seed >>> 2, -2.4, 2.4),
    recentHitterForm: range(seed >>> 3, -2.5, 2.8),
    recentPitcherForm: range(seed >>> 4, -2.6, 2.6),
    bullpenRecentForm: range(seed >>> 5, -2.2, 2.2),
    platoonHistoryEdge: range(seed >>> 6, -1.8, 1.8),
    clutchRecentEdge: range(seed >>> 7, -1.4, 1.6),
    strikeoutWalkTrend: range(seed >>> 8, -1.8, 1.8),
    hardContactTrend: range(seed >>> 9, -1.8, 1.8),
    baseRunningTrend: range(seed >>> 10, -0.9, 1.1),
    historySample: Math.round(range(seed >>> 11, 18, 90))
  };
}

function normalizeRaw(row: RawHistory): MlbPlayerHistoryProfile | null {
  const teamName = text(row.teamName, row.team, row.team_name, row.name, row.TEAM_NAME);
  if (!teamName) return null;
  const base = syntheticProfile(teamName);
  return {
    ...base,
    source: "real",
    batterVsStarterEdge: num(row.batterVsStarterEdge ?? row.bvpEdge ?? row.batterPitcherHistory ?? row.batter_vs_pitcher, base.batterVsStarterEdge),
    pitcherVsLineupEdge: num(row.pitcherVsLineupEdge ?? row.pitcherLineupHistory ?? row.pitcher_vs_lineup, base.pitcherVsLineupEdge),
    recentHitterForm: num(row.recentHitterForm ?? row.hitterForm ?? row.last14HitterForm ?? row.recentBattingForm, base.recentHitterForm),
    recentPitcherForm: num(row.recentPitcherForm ?? row.pitcherForm ?? row.last3PitcherForm ?? row.recentPitchingForm, base.recentPitcherForm),
    bullpenRecentForm: num(row.bullpenRecentForm ?? row.recentBullpenForm ?? row.last7Bullpen, base.bullpenRecentForm),
    platoonHistoryEdge: num(row.platoonHistoryEdge ?? row.platoonEdge ?? row.vsHandednessEdge, base.platoonHistoryEdge),
    clutchRecentEdge: num(row.clutchRecentEdge ?? row.lateInningEdge ?? row.highLeverageRecent, base.clutchRecentEdge),
    strikeoutWalkTrend: num(row.strikeoutWalkTrend ?? row.kbbTrend ?? row.kMinusBbTrend, base.strikeoutWalkTrend),
    hardContactTrend: num(row.hardContactTrend ?? row.barrelTrend ?? row.hardHitTrend ?? row.exitVeloTrend, base.hardContactTrend),
    baseRunningTrend: num(row.baseRunningTrend ?? row.speedTrend ?? row.sbTrend, base.baseRunningTrend),
    historySample: num(row.historySample ?? row.sample ?? row.paSample ?? row.bvpSample ?? row.gamesSample, base.historySample)
  };
}

async function fetchProfiles() {
  const cached = await readHotCache<Record<string, MlbPlayerHistoryProfile>>(CACHE_KEY);
  if (cached) return cached;
  const url =
    process.env.MLB_PLAYER_HISTORY_URL?.trim() ||
    process.env.MLB_RECENT_FORM_URL?.trim() ||
    process.env.MLB_BVP_HISTORY_URL?.trim();
  if (!url) return null;

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const grouped: Record<string, MlbPlayerHistoryProfile> = {};
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

export async function getMlbPlayerHistoryProfile(teamName: string): Promise<MlbPlayerHistoryProfile> {
  const profiles = await fetchProfiles();
  return profiles?.[normalizeMlbTeam(teamName)] ?? syntheticProfile(teamName);
}

function diff(home: number, away: number, scale = 1) {
  return Number(((home - away) * scale).toFixed(2));
}

function sampleConfidence(home: MlbPlayerHistoryProfile, away: MlbPlayerHistoryProfile) {
  const sample = Math.min(220, Math.max(0, home.historySample + away.historySample));
  const realBoost = home.source === "real" && away.source === "real" ? 0.025 : 0;
  return Number(Math.max(0.01, Math.min(0.075, sample / 3600 + realBoost)).toFixed(3));
}

export async function compareMlbPlayerHistory(awayTeam: string, homeTeam: string): Promise<MlbPlayerHistoryComparison> {
  const [away, home] = await Promise.all([
    getMlbPlayerHistoryProfile(awayTeam),
    getMlbPlayerHistoryProfile(homeTeam)
  ]);

  const hitterHistoryEdge = diff(home.batterVsStarterEdge + home.hardContactTrend * 0.6, away.batterVsStarterEdge + away.hardContactTrend * 0.6, 0.32);
  const pitcherHistoryEdge = diff(home.pitcherVsLineupEdge + home.recentPitcherForm * 0.65, away.pitcherVsLineupEdge + away.recentPitcherForm * 0.65, 0.34);
  const recentFormEdge = diff(home.recentHitterForm + home.strikeoutWalkTrend * 0.7, away.recentHitterForm + away.strikeoutWalkTrend * 0.7, 0.26);
  const bullpenHistoryEdge = diff(home.bullpenRecentForm, away.bullpenRecentForm, 0.24);
  const platoonEdge = diff(home.platoonHistoryEdge, away.platoonHistoryEdge, 0.28);
  const contactTrendEdge = diff(home.hardContactTrend + home.baseRunningTrend * 0.35, away.hardContactTrend + away.baseRunningTrend * 0.35, 0.22);
  const clutchEdge = diff(home.clutchRecentEdge, away.clutchRecentEdge, 0.16);

  const historyEdge = Number((
    hitterHistoryEdge * 0.24 +
    pitcherHistoryEdge * 0.28 +
    recentFormEdge * 0.18 +
    bullpenHistoryEdge * 0.12 +
    platoonEdge * 0.1 +
    contactTrendEdge * 0.06 +
    clutchEdge * 0.02
  ).toFixed(2));

  return {
    away,
    home,
    historyEdge,
    hitterHistoryEdge,
    pitcherHistoryEdge,
    recentFormEdge,
    bullpenHistoryEdge,
    platoonHistoryEdge: platoonEdge,
    contactTrendEdge,
    historyConfidence: sampleConfidence(home, away),
    factors: [
      { label: "History hitter vs starter", value: hitterHistoryEdge },
      { label: "History pitcher vs lineup", value: pitcherHistoryEdge },
      { label: "Recent player form", value: recentFormEdge },
      { label: "Recent bullpen form", value: bullpenHistoryEdge },
      { label: "Platoon history", value: platoonEdge },
      { label: "Hard contact trend", value: contactTrendEdge },
      { label: "Recent clutch spots", value: clutchEdge }
    ]
  };
}
