import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";
import type { RealPlayerFeedRecord } from "@/services/simulation/nba-real-player-feed";

export const DEFAULT_DATABALLR_PLAYER_STATS_URL =
  "https://api.databallr.com/api/supabase/player_stats_with_metrics?year=2026&playoffs=0&min_minutes=50&limit=500&order_by=dpm&order_direction=desc";

export type DataBallrDebugPayload = {
  configuredUrl: string;
  fetched: boolean;
  recordCount: number;
  normalizedCount: number;
  sampleRawKeys: string[];
  samplePlayers: Array<Pick<RealPlayerFeedRecord, "playerName" | "teamName" | "projectedMinutes" | "usageRate" | "netImpact" | "source">>;
  error?: string;
};

type RawRow = Record<string, unknown>;

function configuredUrl() {
  return (
    process.env.DATABALLR_PLAYER_STATS_URL?.trim() ||
    process.env.DATABALLR_NBA_PLAYER_STATS_URL?.trim() ||
    DEFAULT_DATABALLR_PLAYER_STATS_URL
  );
}

function headerValue() {
  return process.env.DATABALLR_API_KEY?.trim() || process.env.DATABALLR_TOKEN?.trim() || null;
}

function normalizedKeyMap(row: RawRow) {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) {
    map.set(key.toLowerCase().replace(/[^a-z0-9]+/g, ""), value);
  }
  return map;
}

function value(row: RawRow, ...keys: string[]) {
  const map = normalizedKeyMap(row);
  for (const key of keys) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (map.has(normalized)) return map.get(normalized);
  }
  return null;
}

function text(row: RawRow, ...keys: string[]) {
  for (const key of keys) {
    const candidate = value(row, key);
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return null;
}

function num(row: RawRow, ...keys: string[]) {
  for (const key of keys) {
    const candidate = value(row, key);
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate;
    if (typeof candidate === "string" && candidate.trim() && Number.isFinite(Number(candidate))) return Number(candidate);
  }
  return null;
}

function pct(value: number | null, fallback: number) {
  if (value == null || !Number.isFinite(value)) return fallback;
  return value <= 1 ? Number((value * 100).toFixed(2)) : Number(value.toFixed(2));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rowsFromBody(body: any): RawRow[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.players)) return body.players;
  if (Array.isArray(body?.rows)) return body.rows;
  if (Array.isArray(body?.result)) return body.result;
  return [];
}

function estimateMinutes(row: RawRow) {
  const direct = num(row, "projectedMinutes", "projected_minutes", "minutes_per_game", "min_per_game", "mpg", "avg_minutes", "avg_min", "mp_per_game");
  if (direct != null) return clamp(direct, 4, 38);

  const totalMinutes = num(row, "minutes", "mins", "min", "mp");
  const games = num(row, "games", "gp", "g", "games_played");
  if (totalMinutes != null && games && games > 0) return clamp(totalMinutes / games, 4, 38);
  if (totalMinutes != null && totalMinutes <= 48) return clamp(totalMinutes, 4, 38);

  return 18;
}

function estimateUsage(row: RawRow, minutes: number) {
  const usage = pct(num(row, "usageRate", "usage_rate", "usg", "usg_pct", "usage_pct", "usage"), NaN);
  if (Number.isFinite(usage)) return clamp(usage, 5, 40);

  const points = num(row, "points", "pts", "ppg", "points_per_game");
  if (points != null) return clamp(points * 1.35 + minutes * 0.16, 6, 38);

  return clamp(12 + minutes * 0.32, 6, 28);
}

function normalizeDataBallrRow(row: RawRow): RealPlayerFeedRecord | null {
  const playerName = text(row, "playerName", "player_name", "player", "name", "full_name", "display_name");
  const teamName = text(row, "teamName", "team_name", "team", "team_abbreviation", "team_abbr", "abbr", "current_team", "franchise");
  if (!playerName || !teamName) return null;

  const minutes = estimateMinutes(row);
  const usageRate = estimateUsage(row, minutes);
  const dpm = num(row, "dpm", "DPM", "darko_dpm", "estimated_plus_minus", "epm", "estimatedplusminus");
  const offDpm = num(row, "off_dpm", "odpm", "o_dpm", "offensive_dpm", "off_epm", "offensive_epm", "oepm");
  const defDpm = num(row, "def_dpm", "ddpm", "d_dpm", "defensive_dpm", "def_epm", "defensive_epm", "depm");
  const offensiveEpm = offDpm ?? (dpm != null ? dpm * 0.58 : num(row, "obpm", "off_bpm", "offensive_bpm") ?? 0);
  const defensiveEpm = defDpm ?? (dpm != null ? dpm * 0.42 : num(row, "dbpm", "def_bpm", "defensive_bpm") ?? 0);
  const netImpact = dpm ?? num(row, "netImpact", "net_impact", "bpm", "plus_minus", "plusminus") ?? offensiveEpm + defensiveEpm;
  const assistRate = pct(num(row, "assistRate", "assist_rate", "ast_pct", "astp", "assist_pct"), 10);
  const reboundRate = pct(num(row, "reboundRate", "rebound_rate", "reb_pct", "trb_pct", "oreb_dreb_pct", "rebound_pct"), 8);
  const turnoverRate = pct(num(row, "turnoverRate", "turnover_rate", "tov_pct", "turnover_pct"), 10);
  const trueShooting = pct(num(row, "trueShooting", "true_shooting", "ts", "ts_pct", "true_shooting_pct"), 56);
  const threePointAttemptRate = pct(num(row, "threePointAttemptRate", "three_point_attempt_rate", "threepar", "3par", "fg3a_rate"), 35);
  const blocks = num(row, "blocks", "blk", "blk_pct", "block_pct") ?? 0;
  const steals = num(row, "steals", "stl", "stl_pct", "steal_pct") ?? 0;
  const drives = num(row, "drives", "drive", "rim_attempts", "rim_frequency", "rim_freq", "at_rim_frequency") ?? null;

  return {
    playerName,
    teamName,
    status: "available",
    projectedMinutes: Number(minutes.toFixed(2)),
    usageRate: Number(usageRate.toFixed(2)),
    offensiveEpm: Number(offensiveEpm.toFixed(2)),
    defensiveEpm: Number(defensiveEpm.toFixed(2)),
    netImpact: Number(netImpact.toFixed(2)),
    onOffNet: Number((num(row, "onOffNet", "on_off_net", "onoff", "on_off") ?? netImpact).toFixed(2)),
    trueShooting,
    assistRate,
    reboundRate,
    turnoverRate,
    rimPressure: clamp(drives != null ? drives : usageRate * 0.18 + minutes * 0.04, 0, 10),
    threePointGravity: clamp(threePointAttemptRate / 7.5, 0, 10),
    defensiveVersatility: clamp(5 + defensiveEpm * 0.65 + steals * 0.25, 0, 10),
    pointOfAttackDefense: clamp(5 + defensiveEpm * 0.55 + steals * 0.35, 0, 10),
    rimProtection: clamp(3 + blocks * 0.45 + defensiveEpm * 0.45, 0, 10),
    clutchImpact: clamp(netImpact * 0.35, -3, 5),
    fatigueRisk: clamp(minutes > 34 ? 0.36 : minutes > 30 ? 0.22 : 0.12, 0, 1),
    source: "databallr"
  };
}

export async function fetchDataBallrPlayerFeed() {
  const url = configuredUrl();
  try {
    const headers: HeadersInit = { "User-Agent": "Mozilla/5.0 SharkEdge/1.5" };
    const token = headerValue();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(url, {
      headers,
      cache: "force-cache",
      next: { revalidate: Number(process.env.DATABALLR_CACHE_TTL_SECONDS ?? 60 * 60) }
    });
    if (!response.ok) return [] as RealPlayerFeedRecord[];
    const rows = rowsFromBody(await response.json());
    return rows
      .map(normalizeDataBallrRow)
      .filter((record): record is RealPlayerFeedRecord => Boolean(record?.playerName && record?.teamName));
  } catch {
    return [] as RealPlayerFeedRecord[];
  }
}

export async function getDataBallrDebugPayload(): Promise<DataBallrDebugPayload> {
  const url = configuredUrl();
  try {
    const headers: HeadersInit = { "User-Agent": "Mozilla/5.0 SharkEdge/1.5" };
    const token = headerValue();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) {
      return { configuredUrl: url, fetched: false, recordCount: 0, normalizedCount: 0, sampleRawKeys: [], samplePlayers: [], error: `HTTP ${response.status}` };
    }
    const rows = rowsFromBody(await response.json());
    const normalized = rows.map(normalizeDataBallrRow).filter((record): record is RealPlayerFeedRecord => Boolean(record));
    const teamCount = new Set(normalized.map((record) => normalizeNbaTeam(record.teamName))).size;
    return {
      configuredUrl: url,
      fetched: true,
      recordCount: rows.length,
      normalizedCount: normalized.length,
      sampleRawKeys: Object.keys(rows[0] ?? {}).slice(0, 30),
      samplePlayers: normalized.slice(0, 12).map((record) => ({
        playerName: record.playerName,
        teamName: record.teamName,
        projectedMinutes: record.projectedMinutes,
        usageRate: record.usageRate,
        netImpact: record.netImpact,
        source: record.source
      })),
      error: teamCount ? undefined : "Rows normalized, but team names did not map cleanly."
    };
  } catch (error) {
    return {
      configuredUrl: url,
      fetched: false,
      recordCount: 0,
      normalizedCount: 0,
      sampleRawKeys: [],
      samplePlayers: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
