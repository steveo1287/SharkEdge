import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";

// League-average constants for 2024 season — used to normalize to ERA- and FIP proxies.
const LEAGUE_AVG_ERA = 4.15;
const FIP_CONSTANT = 3.10; // MLB-wide constant for 2024 normalizes FIP ≈ ERA at scale
const CACHE_TTL_SECONDS = 60 * 120; // 2 hours — pitcher stats change slowly intra-day

export type MlbStarterStatLine = {
  playerId: number;
  name: string;
  era: number;
  eraMinus: number; // ERA / leagueAvgERA * 100, lower = better
  fip: number;
  kRate: number;   // strikeouts per 9 IP
  bbRate: number;  // walks per 9 IP
  whip: number;
  inningsPitched: number;
  source: "real" | "synthetic";
};

type MlbStatSplitStat = {
  era?: string | number;
  whip?: string | number;
  strikeOuts?: number;
  baseOnBalls?: number;
  homeRunsAllowed?: number;
  inningsPitched?: string | number;
};

type MlbStatSplit = { stat?: MlbStatSplitStat };
type MlbStatGroup = { splits?: MlbStatSplit[] };
type MlbPeopleStatsResponse = { stats?: MlbStatGroup[]; people?: Array<{ fullName?: string }> };

function safeNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return fallback;
}

function parseIp(ip: string | number | undefined): number {
  if (typeof ip === "number") return ip;
  if (!ip) return 0;
  const str = String(ip);
  const [whole, thirds] = str.split(".");
  return safeNum(whole) + safeNum(thirds) / 3;
}

function syntheticLine(playerId: number): MlbStarterStatLine {
  return { playerId, name: `Pitcher #${playerId}`, era: LEAGUE_AVG_ERA, eraMinus: 100, fip: LEAGUE_AVG_ERA, kRate: 8.5, bbRate: 3.0, whip: 1.28, inningsPitched: 0, source: "synthetic" };
}

function statsApiBase() {
  return process.env.MLB_STATS_API_URL?.trim().replace(/\/$/, "") ?? "https://statsapi.mlb.com/api/v1";
}

export async function getMlbStarterStats(playerId: number): Promise<MlbStarterStatLine | null> {
  if (!playerId || !Number.isFinite(playerId)) return null;
  const cacheKey = `mlb:starter:stats:${playerId}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await readHotCache<MlbStarterStatLine>(cacheKey);
  if (cached) return cached;

  try {
    const season = new Date().getFullYear();
    const url = `${statsApiBase()}/people/${playerId}/stats?stats=season&group=pitching&season=${season}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data: MlbPeopleStatsResponse = await res.json();

    const splitStat = data.stats?.[0]?.splits?.[0]?.stat;
    if (!splitStat) return null;

    const era = safeNum(splitStat.era, LEAGUE_AVG_ERA);
    const ip = parseIp(splitStat.inningsPitched);
    const k = safeNum(splitStat.strikeOuts);
    const bb = safeNum(splitStat.baseOnBalls);
    const hr = safeNum(splitStat.homeRunsAllowed);
    const whip = safeNum(splitStat.whip, 1.28);

    // FIP = (13*HR + 3*BB - 2*K) / IP + FIP_CONSTANT
    const fip = ip > 5 ? Number(((13 * hr + 3 * bb - 2 * k) / ip + FIP_CONSTANT).toFixed(2)) : LEAGUE_AVG_ERA;
    const eraMinus = Number((era / LEAGUE_AVG_ERA * 100).toFixed(1));
    const kRate = ip > 0 ? Number(((k / ip) * 9).toFixed(2)) : 8.5;
    const bbRate = ip > 0 ? Number(((bb / ip) * 9).toFixed(2)) : 3.0;
    const name = data.people?.[0]?.fullName ?? `Pitcher #${playerId}`;

    const result: MlbStarterStatLine = { playerId, name, era, eraMinus, fip, kRate, bbRate, whip, inningsPitched: ip, source: "real" };
    await writeHotCache(cacheKey, result, CACHE_TTL_SECONDS);
    return result;
  } catch {
    return null;
  }
}

// Convenience: fetch both starters in parallel, return null entries for failures.
export async function getMlbGameStarterStats(awayStarterId: number | null | undefined, homeStarterId: number | null | undefined) {
  const [away, home] = await Promise.all([
    awayStarterId ? getMlbStarterStats(awayStarterId).catch(() => null) : Promise.resolve(null),
    homeStarterId ? getMlbStarterStats(homeStarterId).catch(() => null) : Promise.resolve(null)
  ]);
  return { away, home };
}

export { syntheticLine };
