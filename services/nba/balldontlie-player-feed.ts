import { normalizeNbaTeam } from "@/services/simulation/nba-team-analytics";
import type { RealPlayerFeedRecord } from "@/services/simulation/nba-real-player-feed";

const DEFAULT_BASE_URL = "https://api.balldontlie.io/v1";
const DEFAULT_SEASON = 2025;
const MAX_PLAYER_PAGES = 5;
const MAX_SEASON_AVG_IDS = 100;

type RawPlayer = Record<string, unknown>;
type RawSeasonAverage = Record<string, unknown>;

type BallDontLieDebugPayload = {
  configured: boolean;
  baseUrl: string;
  season: number;
  fetched: boolean;
  playerCount: number;
  seasonAverageCount: number;
  normalizedCount: number;
  samplePlayers: Array<Pick<RealPlayerFeedRecord, "playerName" | "teamName" | "projectedMinutes" | "usageRate" | "netImpact" | "source">>;
  error?: string;
};

function apiKey() {
  return process.env.BALLDONTLIE_API_KEY?.trim() || process.env.BALL_DONT_LIE_API_KEY?.trim() || null;
}

function baseUrl() {
  return (process.env.BALLDONTLIE_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function season() {
  const configured = Number(process.env.BALLDONTLIE_SEASON ?? process.env.NBA_STATS_SEASON ?? DEFAULT_SEASON);
  return Number.isFinite(configured) ? configured : DEFAULT_SEASON;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function num(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function percent(value: number | null, fallback: number) {
  if (value == null || !Number.isFinite(value)) return fallback;
  return value <= 1 ? Number((value * 100).toFixed(2)) : Number(value.toFixed(2));
}

function rows(body: any) {
  return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
}

function metaNextCursor(body: any) {
  const cursor = body?.meta?.next_cursor ?? body?.meta?.nextCursor ?? null;
  return typeof cursor === "number" || typeof cursor === "string" ? String(cursor) : null;
}

function authHeaders(): HeadersInit | undefined {
  const key = apiKey();
  if (!key) return undefined;
  return {
    Authorization: key,
    "X-API-Key": key,
    "User-Agent": "Mozilla/5.0 SharkEdge/1.5"
  };
}

async function fetchJson(path: string, params?: Record<string, string | number | Array<string | number>>) {
  const url = new URL(`${baseUrl()}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    headers: authHeaders(),
    cache: "force-cache",
    next: { revalidate: Number(process.env.BALLDONTLIE_CACHE_TTL_SECONDS ?? 60 * 60) }
  });

  if (!response.ok) throw new Error(`balldontlie ${path} failed: HTTP ${response.status}`);
  return response.json();
}

async function fetchPlayers() {
  const result: RawPlayer[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_PLAYER_PAGES; page += 1) {
    const body = await fetchJson("/players", cursor ? { per_page: 100, cursor } : { per_page: 100 });
    result.push(...rows(body));
    cursor = metaNextCursor(body);
    if (!cursor) break;
  }
  return result;
}

function playerId(player: RawPlayer) {
  const id = text(player.id, player.player_id, player.playerId);
  return id;
}

function playerName(player: RawPlayer) {
  const first = text(player.first_name, player.firstName);
  const last = text(player.last_name, player.lastName);
  const full = text(player.name, player.full_name, player.fullName, player.display_name, player.displayName);
  return full ?? [first, last].filter(Boolean).join(" ").trim() || null;
}

function teamName(player: RawPlayer) {
  const team = (player.team ?? player.current_team ?? {}) as Record<string, unknown>;
  return text(team.full_name, team.fullName, team.name, team.abbreviation, player.team_name, player.team, player.team_abbreviation);
}

async function fetchSeasonAverages(playerIds: string[]) {
  if (!playerIds.length) return [] as RawSeasonAverage[];
  const ids = playerIds.slice(0, MAX_SEASON_AVG_IDS);
  const body = await fetchJson("/season_averages", {
    season: season(),
    "player_ids[]": ids
  });
  return rows(body);
}

function averagePlayerId(row: RawSeasonAverage) {
  return text(row.player_id, row.playerId, row.id);
}

function normalizedFromPlayer(player: RawPlayer, average?: RawSeasonAverage): RealPlayerFeedRecord | null {
  const name = playerName(player);
  const team = teamName(player);
  if (!name || !team) return null;

  const minutes = clamp(num(average?.min, average?.minutes, average?.mpg) ?? 14, 4, 38);
  const points = num(average?.pts, average?.points, average?.ppg) ?? 0;
  const rebounds = num(average?.reb, average?.rebounds, average?.rpg) ?? 0;
  const assists = num(average?.ast, average?.assists, average?.apg) ?? 0;
  const steals = num(average?.stl, average?.steals) ?? 0;
  const blocks = num(average?.blk, average?.blocks) ?? 0;
  const turnovers = num(average?.turnover, average?.tov, average?.turnovers) ?? 0;
  const fg3a = num(average?.fg3a, average?.three_pa, average?.threePointAttempts) ?? 0;
  const fga = num(average?.fga, average?.field_goal_attempts) ?? 0;
  const fgPct = percent(num(average?.fg_pct, average?.field_goal_percentage), 46);
  const ftPct = percent(num(average?.ft_pct, average?.free_throw_percentage), 76);
  const usageRate = clamp(points * 1.18 + assists * 1.75 + turnovers * 0.9 + minutes * 0.08, 6, 34);
  const trueShooting = clamp(fgPct * 0.78 + ftPct * 0.08 + Math.min(8, fg3a) * 0.6, 48, 66);
  const assistRate = clamp(assists * 4.2 + usageRate * 0.12, 3, 42);
  const reboundRate = clamp(rebounds * 2.2 + minutes * 0.05, 3, 24);
  const turnoverRate = clamp(turnovers * 4.6 + usageRate * 0.08, 5, 18);
  const threeRate = fga > 0 ? fg3a / fga : fg3a / Math.max(1, minutes / 8);
  const offensiveEpm = clamp(points * 0.11 + assists * 0.16 - turnovers * 0.12 + trueShooting * 0.045 - 3.1, -3, 6.5);
  const defensiveEpm = clamp(steals * 0.65 + blocks * 0.55 + rebounds * 0.05 - 0.8, -2, 4);
  const netImpact = Number((offensiveEpm + defensiveEpm).toFixed(2));

  return {
    playerName: name,
    teamName: team,
    status: "available",
    projectedMinutes: Number(minutes.toFixed(2)),
    usageRate: Number(usageRate.toFixed(2)),
    offensiveEpm: Number(offensiveEpm.toFixed(2)),
    defensiveEpm: Number(defensiveEpm.toFixed(2)),
    netImpact,
    onOffNet: netImpact,
    trueShooting: Number(trueShooting.toFixed(2)),
    assistRate: Number(assistRate.toFixed(2)),
    reboundRate: Number(reboundRate.toFixed(2)),
    turnoverRate: Number(turnoverRate.toFixed(2)),
    rimPressure: clamp(points * 0.22 + minutes * 0.03, 0, 10),
    threePointGravity: clamp(threeRate * 10, 0, 10),
    defensiveVersatility: clamp(5 + defensiveEpm * 0.8 + steals * 0.2, 0, 10),
    pointOfAttackDefense: clamp(5 + steals * 0.8 + defensiveEpm * 0.35, 0, 10),
    rimProtection: clamp(2 + blocks * 1.7 + rebounds * 0.1, 0, 10),
    clutchImpact: clamp(netImpact * 0.35, -3, 5),
    fatigueRisk: clamp(minutes > 34 ? 0.38 : minutes > 30 ? 0.24 : 0.12, 0, 1),
    source: "balldontlie"
  };
}

export async function fetchBallDontLiePlayerFeed() {
  if (!apiKey()) return [] as RealPlayerFeedRecord[];
  try {
    const players = await fetchPlayers();
    const playerIds = players.map(playerId).filter((id): id is string => Boolean(id));
    const averages = await fetchSeasonAverages(playerIds);
    const averagesById = new Map(averages.map((average) => [averagePlayerId(average), average]));
    return players
      .map((player) => normalizedFromPlayer(player, averagesById.get(playerId(player) ?? "")))
      .filter((record): record is RealPlayerFeedRecord => Boolean(record))
      .filter((record) => record.projectedMinutes >= 4)
      .filter((record, index, records) => records.findIndex((other) => `${normalizeNbaTeam(other.teamName)}:${other.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "")}` === `${normalizeNbaTeam(record.teamName)}:${record.playerName.toLowerCase().replace(/[^a-z0-9]+/g, "")}`) === index);
  } catch {
    return [] as RealPlayerFeedRecord[];
  }
}

export async function getBallDontLieDebugPayload(): Promise<BallDontLieDebugPayload> {
  if (!apiKey()) {
    return { configured: false, baseUrl: baseUrl(), season: season(), fetched: false, playerCount: 0, seasonAverageCount: 0, normalizedCount: 0, samplePlayers: [], error: "BALLDONTLIE_API_KEY is not configured." };
  }

  try {
    const players = await fetchPlayers();
    const playerIds = players.map(playerId).filter((id): id is string => Boolean(id));
    const averages = await fetchSeasonAverages(playerIds);
    const averagesById = new Map(averages.map((average) => [averagePlayerId(average), average]));
    const normalized = players
      .map((player) => normalizedFromPlayer(player, averagesById.get(playerId(player) ?? "")))
      .filter((record): record is RealPlayerFeedRecord => Boolean(record));
    return {
      configured: true,
      baseUrl: baseUrl(),
      season: season(),
      fetched: true,
      playerCount: players.length,
      seasonAverageCount: averages.length,
      normalizedCount: normalized.length,
      samplePlayers: normalized.slice(0, 12).map((record) => ({
        playerName: record.playerName,
        teamName: record.teamName,
        projectedMinutes: record.projectedMinutes,
        usageRate: record.usageRate,
        netImpact: record.netImpact,
        source: record.source
      }))
    };
  } catch (error) {
    return {
      configured: true,
      baseUrl: baseUrl(),
      season: season(),
      fetched: false,
      playerCount: 0,
      seasonAverageCount: 0,
      normalizedCount: 0,
      samplePlayers: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
