import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { fetchRawFeedRows, pick } from "@/services/mlb/raw-feed-parser";
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
  const teamName = text(pick(row, "teamName", "team", "team_name", "Team", "Tm"));
  if (!teamName) return null;
  const fallback = syntheticSplit(teamName);
  const base = {
    teamName,
    source: "real" as const,
    hitterXwobaVsFastball: num(pick(row, "hitterXwobaVsFastball", "xwoba_fastball", "xwobaVsFastball"), fallback.hitterXwobaVsFastball),
    hitterXwobaVsBreaking: num(pick(row, "hitterXwobaVsBreaking", "xwoba_breaking", "xwobaVsBreaking"), fallback.hitterXwobaVsBreaking),
    hitterXwobaVsOffspeed: num(pick(row, "hitterXwobaVsOffspeed", "xwoba_offspeed", "xwobaVsOffspeed"), fallback.hitterXwobaVsOffspeed),
    barrelRate: num(pick(row, "barrelRate", "barrel_rate", "Barrel%", "BarrelPct"), fallback.barrelRate),
    hardHitRate: num(pick(row, "hardHitRate", "hard_hit_rate", "HardHit%", "HardHitPct"), fallback.hardHitRate),
    sweetSpotRate: num(pick(row, "sweetSpotRate", "sweet_spot_rate", "SweetSpot%"), fallback.sweetSpotRate),
    chaseRate: num(pick(row, "chaseRate", "chase_rate", "Chase%"), fallback.chaseRate),
    whiffRate: num(pick(row, "whiffRate", "whiff_rate", "Whiff%"), fallback.whiffRate),
    pitcherFastballRunValue: num(pick(row, "pitcherFastballRunValue", "fastball_run_value", "FBRunValue"), fallback.pitcherFastballRunValue),
    pitcherBreakingRunValue: num(pick(row, "pitcherBreakingRunValue", "breaking_run_value", "BreakingRunValue"), fallback.pitcherBreakingRunValue),
    pitcherOffspeedRunValue: num(pick(row, "pitcherOffspeedRunValue", "offspeed_run_value", "OffspeedRunValue"), fallback.pitcherOffspeedRunValue),
    pitcherAvgExitVeloAllowed: num(pick(row, "pitcherAvgExitVeloAllowed", "avg_exit_velo_allowed", "EVAllowed"), fallback.pitcherAvgExitVeloAllowed),
    pitcherBarrelAllowedRate: num(pick(row, "pitcherBarrelAllowedRate", "barrel_allowed_rate", "BarrelAllowed%"), fallback.pitcherBarrelAllowedRate),
    weatherCarrySensitivity: num(pick(row, "weatherCarrySensitivity", "weather_carry_sensitivity"), fallback.weatherCarrySensitivity)
  };
  return { ...base, ...derive(base) };
}

async function fetchSplits() {
  const cached = await readHotCache<Record<string, MlbStatcastSplit>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.MLB_STATCAST_SPLITS_URL?.trim();
  if (!url) return null;
  try {
    const grouped: Record<string, MlbStatcastSplit> = {};
    for (const row of await fetchRawFeedRows(url, ["teams", "data", "rows", "splits"])) {
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
