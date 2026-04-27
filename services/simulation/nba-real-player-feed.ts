import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";

export type RealPlayerFeedRecord = {
  playerName: string;
  teamName: string;
  status: "available" | "questionable" | "doubtful" | "out" | "unknown";
  projectedMinutes: number;
  usageRate: number;
  offensiveEpm: number;
  defensiveEpm: number;
  netImpact: number;
  onOffNet: number;
  trueShooting: number;
  assistRate: number;
  reboundRate: number;
  turnoverRate: number;
  rimPressure: number;
  threePointGravity: number;
  defensiveVersatility: number;
  pointOfAttackDefense: number;
  rimProtection: number;
  clutchImpact: number;
  fatigueRisk: number;
  source: "nba-stats-api" | "lineup-feed" | "injury-feed" | "merged";
};

const CACHE_KEY = "nba:real-player-feed:v1";
const CACHE_TTL_SECONDS = 60 * 60 * 4;

type RawRow = Record<string, unknown>;

function num(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function statusFrom(value: unknown): RealPlayerFeedRecord["status"] {
  const lower = String(value ?? "available").toLowerCase();
  if (lower.includes("out") || lower.includes("inactive") || lower.includes("suspend")) return "out";
  if (lower.includes("doubt")) return "doubtful";
  if (lower.includes("question")) return "questionable";
  if (lower.includes("available") || lower.includes("probable") || lower.includes("active")) return "available";
  return "unknown";
}

function percent(value: number | null, fallback: number) {
  if (value === null) return fallback;
  return value <= 1 ? Number((value * 100).toFixed(2)) : value;
}

function rowsFromBody(body: any): RawRow[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.players)) return body.players;
  if (Array.isArray(body?.profiles)) return body.profiles;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.resultSets?.[0]?.rowSet) && Array.isArray(body?.resultSets?.[0]?.headers)) {
    const headers = body.resultSets[0].headers;
    return body.resultSets[0].rowSet.map((row: unknown[]) => Object.fromEntries(headers.map((header: string, index: number) => [header, row[index]])));
  }
  return [];
}

function normalizeRow(row: RawRow, source: RealPlayerFeedRecord["source"]): RealPlayerFeedRecord | null {
  const playerName = text(row.playerName, row.player, row.name, row.PLAYER_NAME, row.player_name);
  const teamName = text(row.teamName, row.team, row.team_name, row.TEAM_NAME, row.TEAM_ABBREVIATION);
  if (!playerName || !teamName) return null;
  const minutes = num(row.projectedMinutes, row.projected_minutes, row.MIN, row.minutes) ?? 0;
  const usage = percent(num(row.usageRate, row.usage_rate, row.USG_PCT, row.usage), 0);
  const off = num(row.offensiveEpm, row.off_epm, row.offensive_impact, row.OFF_RATING) ?? 0;
  const def = num(row.defensiveEpm, row.def_epm, row.defensive_impact, row.DEF_RATING) ?? 0;
  return {
    playerName,
    teamName,
    status: statusFrom(row.status ?? row.injury_status ?? row.INJURY_STATUS),
    projectedMinutes: minutes,
    usageRate: usage,
    offensiveEpm: off,
    defensiveEpm: def,
    netImpact: num(row.netImpact, row.net_impact, row.net_rating_impact, row.NET_RATING) ?? off + def,
    onOffNet: num(row.onOffNet, row.on_off_net, row.ON_OFF_NET) ?? 0,
    trueShooting: percent(num(row.trueShooting, row.ts_pct, row.TS_PCT), 56),
    assistRate: percent(num(row.assistRate, row.ast_rate, row.AST_PCT), 10),
    reboundRate: percent(num(row.reboundRate, row.reb_rate, row.REB_PCT), 8),
    turnoverRate: percent(num(row.turnoverRate, row.tov_rate, row.TOV_PCT), 10),
    rimPressure: num(row.rimPressure, row.rim_pressure, row.drives, row.DRIVES) ?? 0,
    threePointGravity: num(row.threePointGravity, row.three_point_gravity, row.FG3A, row.three_pa) ?? 0,
    defensiveVersatility: num(row.defensiveVersatility, row.defensive_versatility) ?? 0,
    pointOfAttackDefense: num(row.pointOfAttackDefense, row.poa_defense) ?? 0,
    rimProtection: num(row.rimProtection, row.rim_protection, row.blocks, row.BLK) ?? 0,
    clutchImpact: num(row.clutchImpact, row.clutch_impact) ?? 0,
    fatigueRisk: num(row.fatigueRisk, row.fatigue_risk) ?? 0,
    source
  };
}

async function fetchSource(url: string | undefined, source: RealPlayerFeedRecord["source"]) {
  if (!url?.trim()) return [] as RealPlayerFeedRecord[];
  try {
    const response = await fetch(url.trim(), { cache: "no-store" });
    if (!response.ok) return [];
    return rowsFromBody(await response.json()).map((row) => normalizeRow(row, source)).filter((row): row is RealPlayerFeedRecord => Boolean(row));
  } catch {
    return [];
  }
}

function mergeRecords(records: RealPlayerFeedRecord[]) {
  const map = new Map<string, RealPlayerFeedRecord>();
  for (const record of records) {
    const key = `${normalizeNbaTeam(record.teamName)}:${record.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, record);
      continue;
    }
    map.set(key, {
      ...existing,
      ...record,
      playerName: existing.playerName,
      teamName: existing.teamName,
      status: record.status !== "unknown" ? record.status : existing.status,
      projectedMinutes: record.projectedMinutes || existing.projectedMinutes,
      usageRate: record.usageRate || existing.usageRate,
      source: "merged"
    });
  }
  return Array.from(map.values());
}

export async function getMergedRealPlayerFeed() {
  const cached = await readHotCache<RealPlayerFeedRecord[]>(CACHE_KEY);
  if (cached) return cached;
  const [stats, lineup, injury] = await Promise.all([
    fetchSource(process.env.NBA_STATS_API_PLAYER_PROFILE_URL ?? process.env.NBA_PLAYER_STATS_URL, "nba-stats-api"),
    fetchSource(process.env.NBA_LINEUP_PLAYER_PROFILE_URL ?? process.env.NBA_LINEUP_DATA_URL, "lineup-feed"),
    fetchSource(process.env.NBA_INJURY_PLAYER_PROFILE_URL ?? process.env.NBA_PLAYER_IMPACT_URL ?? process.env.NBA_INJURY_IMPACT_URL, "injury-feed")
  ]);
  const merged = mergeRecords([...stats, ...lineup, ...injury]);
  if (merged.length) await writeHotCache(CACHE_KEY, merged, CACHE_TTL_SECONDS);
  return merged;
}
