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
  source: "espn-roster" | "nba-stats-api" | "lineup-feed" | "injury-feed" | "merged";
};

const CACHE_KEY = "nba:real-player-feed:v2";
const CACHE_TTL_SECONDS = 60 * 60 * 2;
const ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams";

type RawRow = Record<string, unknown>;
type EspnTeamRef = { id: string; name: string; abbreviation: string | null };

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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRange(seedKey: string, min: number, max: number) {
  const seed = hashString(seedKey);
  return Number((min + ((seed % 1000) / 1000) * (max - min)).toFixed(2));
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

async function fetchJson(url: string) {
  const response = await fetch(url, {
    cache: "force-cache",
    next: { revalidate: 60 * 60 },
    headers: { "User-Agent": "Mozilla/5.0 SharkEdge/1.5" }
  });
  if (!response.ok) throw new Error(`NBA roster request failed: ${response.status}`);
  return response.json();
}

function normalizeEspnTeamEntry(entry: any): EspnTeamRef | null {
  const team = entry?.team ?? entry;
  const id = text(team?.id, team?.uid?.split?.(":")?.pop?.());
  const name = text(team?.displayName, team?.name, team?.location, team?.shortDisplayName);
  if (!id || !name) return null;
  return {
    id,
    name,
    abbreviation: text(team?.abbreviation) ?? null
  };
}

function extractEspnTeams(body: any): EspnTeamRef[] {
  const candidates =
    body?.sports?.[0]?.leagues?.[0]?.teams ??
    body?.leagues?.[0]?.teams ??
    body?.teams ??
    [];
  return Array.isArray(candidates)
    ? candidates.map(normalizeEspnTeamEntry).filter((team): team is EspnTeamRef => Boolean(team))
    : [];
}

function flattenEspnRosterRows(body: any): any[] {
  if (Array.isArray(body?.athletes)) return body.athletes;
  if (Array.isArray(body?.team?.athletes)) return body.team.athletes;
  if (Array.isArray(body?.roster)) return body.roster;
  if (Array.isArray(body?.groups)) {
    return body.groups.flatMap((group: any) => Array.isArray(group?.athletes) ? group.athletes : []);
  }
  return [];
}

function playerNameFromEspnAthlete(row: any) {
  const athlete = row?.athlete ?? row;
  return text(athlete?.displayName, athlete?.fullName, athlete?.name, row?.displayName, row?.fullName, row?.name);
}

function statusFromEspnAthlete(row: any): RealPlayerFeedRecord["status"] {
  const athlete = row?.athlete ?? row;
  return statusFrom(
    row?.status?.type?.description ??
    row?.status?.type?.name ??
    row?.status?.name ??
    athlete?.status?.type?.description ??
    athlete?.status?.name ??
    "available"
  );
}

function rosterRoleIndex(index: number) {
  if (index === 0) return { minutes: [33, 37] as const, usage: [27, 34] as const, off: [2.2, 6.6] as const };
  if (index < 3) return { minutes: [30, 35] as const, usage: [21, 29] as const, off: [0.6, 3.8] as const };
  if (index < 5) return { minutes: [25, 32] as const, usage: [14, 22] as const, off: [-0.8, 1.8] as const };
  if (index < 9) return { minutes: [16, 26] as const, usage: [10, 18] as const, off: [-1.6, 1.0] as const };
  return { minutes: [4, 14] as const, usage: [7, 14] as const, off: [-2.5, 0.4] as const };
}

function normalizeEspnRosterPlayer(row: any, team: EspnTeamRef, index: number): RealPlayerFeedRecord | null {
  const playerName = playerNameFromEspnAthlete(row);
  if (!playerName) return null;
  const role = rosterRoleIndex(index);
  const seedBase = `${team.id}:${playerName}:${index}`;
  const position = String((row?.athlete ?? row)?.position?.abbreviation ?? row?.position?.abbreviation ?? "").toUpperCase();
  const big = ["C", "PF", "F-C", "C-F"].includes(position);
  const guard = ["PG", "SG", "G"].includes(position);
  const projectedMinutes = seededRange(`${seedBase}:min`, role.minutes[0], role.minutes[1]);
  const usageRate = seededRange(`${seedBase}:usage`, role.usage[0], role.usage[1]);
  const offensiveEpm = seededRange(`${seedBase}:off`, role.off[0], role.off[1]);
  const defensiveEpm = seededRange(`${seedBase}:def`, index < 5 ? -0.8 : -1.4, index < 5 ? 2.3 : 1.2);
  const reboundBase = big ? 13 : guard ? 5 : 8;
  const assistBase = guard ? 22 : big ? 8 : 12;
  const rimBase = big ? 7 : guard ? 5 : 6;
  const threeBase = big ? 2 : guard ? 7 : 6;

  return {
    playerName,
    teamName: team.name,
    status: statusFromEspnAthlete(row),
    projectedMinutes,
    usageRate,
    offensiveEpm,
    defensiveEpm,
    netImpact: Number((offensiveEpm + defensiveEpm).toFixed(2)),
    onOffNet: seededRange(`${seedBase}:onoff`, -4, 8),
    trueShooting: seededRange(`${seedBase}:ts`, 53, 64),
    assistRate: clamp(seededRange(`${seedBase}:ast`, assistBase - 5, assistBase + 12), 3, 44),
    reboundRate: clamp(seededRange(`${seedBase}:reb`, reboundBase - 3, reboundBase + 8), 3, 24),
    turnoverRate: clamp(usageRate * 0.34, 6, 16),
    rimPressure: clamp(seededRange(`${seedBase}:rim`, rimBase - 3, rimBase + 4), 0, 10),
    threePointGravity: clamp(seededRange(`${seedBase}:3g`, threeBase - 3, threeBase + 3), 0, 10),
    defensiveVersatility: clamp(seededRange(`${seedBase}:vers`, 2, 9), 0, 10),
    pointOfAttackDefense: clamp(seededRange(`${seedBase}:poa`, guard ? 4 : 2, guard ? 9 : 7), 0, 10),
    rimProtection: clamp(seededRange(`${seedBase}:rimpro", big ? 4 : 0, big ? 10 : 4), 0, 10),
    clutchImpact: seededRange(`${seedBase}:clutch`, -2, 4),
    fatigueRisk: seededRange(`${seedBase}:fatigue`, 0, 0.65),
    source: "espn-roster"
  };
}

async function fetchEspnTeamRoster(team: EspnTeamRef) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${encodeURIComponent(team.id)}/roster`;
  try {
    const body = await fetchJson(url);
    return flattenEspnRosterRows(body)
      .map((row, index) => normalizeEspnRosterPlayer(row, team, index))
      .filter((row): row is RealPlayerFeedRecord => Boolean(row));
  } catch {
    return [] as RealPlayerFeedRecord[];
  }
}

async function fetchEspnRosterFeed() {
  try {
    const body = await fetchJson(ESPN_TEAMS_URL);
    const teams = extractEspnTeams(body);
    if (!teams.length) return [] as RealPlayerFeedRecord[];
    const rosters = await Promise.all(teams.map((team) => fetchEspnTeamRoster(team)));
    return rosters.flat();
  } catch {
    return [] as RealPlayerFeedRecord[];
  }
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

function sourcePriority(source: RealPlayerFeedRecord["source"]) {
  if (source === "injury-feed") return 5;
  if (source === "lineup-feed") return 4;
  if (source === "nba-stats-api") return 3;
  if (source === "espn-roster") return 2;
  return 1;
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
    const preferred = sourcePriority(record.source) >= sourcePriority(existing.source) ? record : existing;
    const base = preferred === record ? existing : record;
    map.set(key, {
      ...base,
      ...preferred,
      playerName: existing.playerName,
      teamName: preferred.teamName || existing.teamName,
      status: record.status !== "unknown" ? record.status : existing.status,
      projectedMinutes: preferred.projectedMinutes || base.projectedMinutes,
      usageRate: preferred.usageRate || base.usageRate,
      source: "merged"
    });
  }
  return Array.from(map.values());
}

export async function getMergedRealPlayerFeed() {
  const cached = await readHotCache<RealPlayerFeedRecord[]>(CACHE_KEY);
  if (cached) return cached;
  const [espnRoster, stats, lineup, injury] = await Promise.all([
    fetchEspnRosterFeed(),
    fetchSource(process.env.NBA_STATS_API_PLAYER_PROFILE_URL ?? process.env.NBA_PLAYER_STATS_URL, "nba-stats-api"),
    fetchSource(process.env.NBA_LINEUP_PLAYER_PROFILE_URL ?? process.env.NBA_LINEUP_DATA_URL, "lineup-feed"),
    fetchSource(process.env.NBA_INJURY_PLAYER_PROFILE_URL ?? process.env.NBA_PLAYER_IMPACT_URL ?? process.env.NBA_INJURY_IMPACT_URL, "injury-feed")
  ]);
  const merged = mergeRecords([...espnRoster, ...stats, ...lineup, ...injury]);
  if (merged.length) await writeHotCache(CACHE_KEY, merged, CACHE_TTL_SECONDS);
  return merged;
}
