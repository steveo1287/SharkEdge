import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

export type MlbLineupLock = {
  gameId?: string | null;
  awayTeam: string;
  homeTeam: string;
  awayLineupLocked: boolean;
  homeLineupLocked: boolean;
  awayStarterLocked: boolean;
  homeStarterLocked: boolean;
  awayStarterName?: string | null;
  homeStarterName?: string | null;
  awayStarterThrows?: "L" | "R" | "unknown";
  homeStarterThrows?: "L" | "R" | "unknown";
  awayLineupPlayers: string[];
  homeLineupPlayers: string[];
  lineupConfidence: number;
  starterConfidence: number;
  lockScore: number;
  volatilityAdjustment: number;
  notes: string[];
  source: "real" | "synthetic";
};

type RawLock = Record<string, unknown>;
const CACHE_KEY = "mlb:lineup-locks:v1";
const CACHE_TTL_SECONDS = 60 * 30;

function bool(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").toLowerCase();
  return ["true", "yes", "confirmed", "locked", "official"].includes(text);
}
function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return fallback; }
function text(...values: unknown[]) { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return null; }
function throwsSide(value: unknown): "L" | "R" | "unknown" { const v = String(value ?? "").toUpperCase(); if (v === "L" || v === "R") return v; return "unknown"; }
function stringArray(value: unknown) { if (Array.isArray(value)) return value.map(String).filter(Boolean); if (typeof value === "string" && value.includes(",")) return value.split(",").map((part) => part.trim()).filter(Boolean); return []; }
function keyFor(awayTeam: string, homeTeam: string) { return `${normalizeMlbTeam(awayTeam)}@${normalizeMlbTeam(homeTeam)}`; }
function rowsFromBody(body: any): RawLock[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.games)) return body.games; if (Array.isArray(body?.lineups)) return body.lineups; if (Array.isArray(body?.data)) return body.data; return []; }

function syntheticLock(awayTeam: string, homeTeam: string): MlbLineupLock {
  return {
    awayTeam,
    homeTeam,
    awayLineupLocked: false,
    homeLineupLocked: false,
    awayStarterLocked: false,
    homeStarterLocked: false,
    awayStarterName: null,
    homeStarterName: null,
    awayStarterThrows: "unknown",
    homeStarterThrows: "unknown",
    awayLineupPlayers: [],
    homeLineupPlayers: [],
    lineupConfidence: 35,
    starterConfidence: 35,
    lockScore: 0.35,
    volatilityAdjustment: 1.18,
    notes: ["No confirmed MLB lineup/starter lock feed found; volatility raised for uncertainty."],
    source: "synthetic"
  };
}

function normalizeRaw(row: RawLock): MlbLineupLock | null {
  const awayTeam = text(row.awayTeam, row.away, row.away_team);
  const homeTeam = text(row.homeTeam, row.home, row.home_team);
  if (!awayTeam || !homeTeam) return null;
  const awayLineupLocked = bool(row.awayLineupLocked ?? row.away_lineup_locked ?? row.awayLineupStatus);
  const homeLineupLocked = bool(row.homeLineupLocked ?? row.home_lineup_locked ?? row.homeLineupStatus);
  const awayStarterLocked = bool(row.awayStarterLocked ?? row.away_starter_locked ?? row.awayStarterStatus);
  const homeStarterLocked = bool(row.homeStarterLocked ?? row.home_starter_locked ?? row.homeStarterStatus);
  const lineupConfidence = num(row.lineupConfidence, ((awayLineupLocked ? 50 : 0) + (homeLineupLocked ? 50 : 0)) || 45);
  const starterConfidence = num(row.starterConfidence, ((awayStarterLocked ? 50 : 0) + (homeStarterLocked ? 50 : 0)) || 45);
  const lockScore = Math.max(0, Math.min(1, (lineupConfidence + starterConfidence) / 200));
  return {
    gameId: text(row.gameId, row.eventId, row.id),
    awayTeam,
    homeTeam,
    awayLineupLocked,
    homeLineupLocked,
    awayStarterLocked,
    homeStarterLocked,
    awayStarterName: text(row.awayStarterName, row.away_starter, row.awayProbablePitcher),
    homeStarterName: text(row.homeStarterName, row.home_starter, row.homeProbablePitcher),
    awayStarterThrows: throwsSide(row.awayStarterThrows ?? row.away_throws),
    homeStarterThrows: throwsSide(row.homeStarterThrows ?? row.home_throws),
    awayLineupPlayers: stringArray(row.awayLineupPlayers ?? row.away_lineup),
    homeLineupPlayers: stringArray(row.homeLineupPlayers ?? row.home_lineup),
    lineupConfidence,
    starterConfidence,
    lockScore,
    volatilityAdjustment: Number((1.2 - lockScore * 0.28).toFixed(2)),
    notes: [
      awayStarterLocked && homeStarterLocked ? "Both probable starters are locked." : "Probable starter uncertainty remains.",
      awayLineupLocked && homeLineupLocked ? "Both lineups are confirmed." : "Lineup uncertainty remains."
    ],
    source: "real"
  };
}

async function fetchLocks() {
  const cached = await readHotCache<Record<string, MlbLineupLock>>(CACHE_KEY);
  if (cached) return cached;
  const url = process.env.MLB_LINEUP_LOCKS_URL?.trim() || process.env.MLB_LINEUPS_URL?.trim() || process.env.MLB_STARTERS_URL?.trim();
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const grouped: Record<string, MlbLineupLock> = {};
    for (const row of rowsFromBody(await response.json())) {
      const lock = normalizeRaw(row);
      if (lock) grouped[keyFor(lock.awayTeam, lock.homeTeam)] = lock;
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

export async function getMlbLineupLock(awayTeam: string, homeTeam: string): Promise<MlbLineupLock> {
  const locks = await fetchLocks();
  return locks?.[keyFor(awayTeam, homeTeam)] ?? syntheticLock(awayTeam, homeTeam);
}
