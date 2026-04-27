import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

export type MlbStatcastSplit = {
  teamName: string;
  source: "real" | "synthetic";
  hitterXwobaVsFastball: number;
  hitterXwobaVsBreaking: number;
  hitterXwobaVsOffspeed: number;
  barrelRate: number;
  hardHitRate: number;
  sweetSpotRate: number;
  chaseRate: number;
  whiffRate: number;
  pitcherFastballRunValue: number;
  pitcherBreakingRunValue: number;
  pitcherOffspeedRunValue: number;
  pitcherAvgExitVeloAllowed: number;
  pitcherBarrelAllowedRate: number;
  weatherCarrySensitivity: number;
  statcastOffenseEdge: number;
  statcastPitchingEdge: number;
  statcastTotalEdge: number;
  volatilityEdge: number;
};

type RawSplit = Record<string, unknown>;
const CACHE_KEY = "mlb:statcast:splits:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 8;

function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return fallback; }
function text(...values: unknown[]) { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return null; }
function rowsFromBody(body: any): RawSplit[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.teams)) return body.teams; if (Array.isArray(body?.data)) return body.data; if (Array.isArray(body?.splits)) return body.splits; return []; }
function hashString(value: string) { let hash = 0; for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0; return hash; }
function seedUnit(seed: number) { return (seed % 1000) / 1000; }
function range(seed: number, min: number, max: number) { return Number((min + seedUnit(seed) * (max - min)).toFixed(3)); }

function derive(base: Omit<MlbStatcastSplit, "statcastOffenseEdge" | "statcastPitchingEdge" | "statcastTotalEdge" | "volatilityEdge">) {
  const pitchTypeEdge = ((base.hitterXwobaVsFastball - 0.33) + (base.hitterXwobaVsBreaking - 0.29) + (base.hitterXwobaVsOffspeed - 0.3)) * 18;
  const qualityContact = (base.barrelRate - 8) * 0.22 + (base.hardHitRate - 40) * 0.08 + (base.sweetSpotRate - 33) * 0.05;
  const disciplinePenalty = (base.chaseRate - 29) * -0.05 + (base.whiffRate - 24) * -0.04;
  const pitchingEdge = (0 - base.pitcherFastballRunValue) * 0.12 + (0 - base.pitcherBreakingRunValue) * 0.12 + (0 - base.pitcherOffspeedRunValue) * 0.12 + (88 - base.pitcherAvgExitVeloAllowed) * 0.08 + (7 - base.pitcherBarrelAllowedRate) * 0.18;
  const offense = Number((pitchTypeEdge + qualityContact + disciplinePenalty).toFixed(2));
  const pitching = Number(pitchingEdge.toFixed(2));
  return {
    statcastOffenseEdge: offense,
    statcastPitchingEdge: pitching,
    statcastTotalEdge: Number(((qualityContact * 0.35) + (base.weatherCarrySensitivity * 0.45) + Math.abs(offense) * 0.08 - pitching * 0.12).toFixed(2)),
    volatilityEdge: Number(Math.max(0.85, Math.min(1.45, 1 + Math.abs(base.barrelRate - 8) / 35 + Math.abs(base.whiffRate - 24) / 60)).toFixed(2))
  };
}

function syntheticSplit(teamName: string): MlbStatcastSplit {
  const seed = hashString(`${teamName}:statcast`);
  const base = {
    teamName,
    source: "synthetic" as const,
    hitterXwobaVsFastball: range(seed >>> 1, 0.3, 0.365),
    hitterXwobaVsBreaking: range(seed >>> 2, 0.255, 0.335),
    hitterXwobaVsOffspeed: range(seed >>> 3, 0.265, 0.345),
    barrelRate: range(seed >>> 4, 5, 12),
    hardHitRate: range(seed >>> 5, 34, 48),
    sweetSpotRate: range(seed >>> 6, 29, 38),
    chaseRate: range(seed >>> 7, 24, 35),
    whiffRate: range(seed >>> 8, 19, 31),
    pitcherFastballRunValue: range(seed >>> 9, -8, 8),
    pitcherBreakingRunValue: range(seed >>> 10, -8, 8),
    pitcherOffspeedRunValue: range(seed >>> 11, -8, 8),
    pitcherAvgExitVeloAllowed: range(seed >>> 12, 86, 91),
    pitcherBarrelAllowedRate: range(seed >>> 13, 5, 10),
    weatherCarrySensitivity: range(seed >>> 14, -0.6, 0.9)
  };
  return { ...base, ...derive(base) };
}

function normalizeRaw(row: RawSplit): MlbStatcastSplit | null {
  const teamName = text(row.teamName, row.team, row.team_name, row.Team);
  if (!teamName) return null;
  const fallback = syntheticSplit(teamName);
  const base = {
    teamName,
    source: "real" as const,
    hitterXwobaVsFastball: num(row.hitterXwobaVsFastball ?? row.xwoba_fastball ?? row.xwobaVsFastball, fallback.hitterXwobaVsFastball),
    hitterXwobaVsBreaking: num(row.hitterXwobaVsBreaking ?? row.xwoba_breaking ?? row.xwobaVsBreaking, fallback.hitterXwobaVsBreaking),
    hitterXwobaVsOffspeed: num(row.hitterXwobaVsOffspeed ?? row.xwoba_offspeed ?? row.xwobaVsOffspeed, fallback.hitterXwobaVsOffspeed),
    barrelRate: num(row.barrelRate ?? row.barrel_rate ?? row.BarrelPct, fallback.barrelRate),
    hardHitRate: num(row.hardHitRate ?? row.hard_hit_rate ?? row.HardHitPct, fallback.hardHitRate),
    sweetSpotRate: num(row.sweetSpotRate ?? row.sweet_spot_rate, fallback.sweetSpotRate),
    chaseRate: num(row.chaseRate ?? row.chase_rate, fallback.chaseRate),
    whiffRate: num(row.whiffRate ?? row.whiff_rate, fallback.whiffRate),
    pitcherFastballRunValue: num(row.pitcherFastballRunValue ?? row.fastball_run_value, fallback.pitcherFastballRunValue),
    pitcherBreakingRunValue: num(row.pitcherBreakingRunValue ?? row.breaking_run_value, fallback.pitcherBreakingRunValue),
    pitcherOffspeedRunValue: num(row.pitcherOffspeedRunValue ?? row.offspeed_run_value, fallback.pitcherOffspeedRunValue),
    pitcherAvgExitVeloAllowed: num(row.pitcherAvgExitVeloAllowed ?? row.avg_exit_velo_allowed, fallback.pitcherAvgExitVeloAllowed),
    pitcherBarrelAllowedRate: num(row.pitcherBarrelAllowedRate ?? row.barrel_allowed_rate, fallback.pitcherBarrelAllowedRate),
    weatherCarrySensitivity: num(row.weatherCarrySensitivity ?? row.weather_carry_sensitivity, fallback.weatherCarrySensitivity)
  };
  return { ...base, ...derive(base) };
}

async function fetchSplits() {
  const cached = await readHotCache<Record<string, MlbStatcastSplit>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.MLB_STATCAST_SPLITS_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const grouped: Record<string, MlbStatcastSplit> = {};
    for (const row of rowsFromBody(await response.json())) {
      const split = normalizeRaw(row);
      if (split) grouped[normalizeMlbTeam(split.teamName)] = split;
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

export async function getMlbStatcastSplit(teamName: string): Promise<MlbStatcastSplit> {
  const splits = await fetchSplits();
  return splits?.[normalizeMlbTeam(teamName)] ?? syntheticSplit(teamName);
}
