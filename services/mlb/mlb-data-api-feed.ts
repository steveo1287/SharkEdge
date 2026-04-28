import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import type { MlbPlayerProfile } from "@/services/simulation/mlb-player-model";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

type RawRow = Record<string, unknown>;

type MlbDataApiDebugPayload = {
  ok: boolean;
  teamName: string;
  normalizedTeamKey: string;
  teamId: string | null;
  baseUrl: string;
  rosterCount: number;
  profileCount: number;
  samplePlayers: Array<Pick<MlbPlayerProfile, "playerName" | "teamName" | "playerType" | "role" | "projectedPa" | "projectedInnings" | "source">>;
  error?: string;
};

const CACHE_TTL_SECONDS = 60 * 60 * 12;
const DEFAULT_BASE_URL = "https://lookup-service-prod.mlb.com";

const TEAM_IDS: Record<string, string> = {
  arizonadiamondbacks: "109",
  atlantaBraves: "144",
  atlantabraves: "144",
  baltimoreorioles: "110",
  bostonredsox: "111",
  chicagocubs: "112",
  chicagoWhiteSox: "145",
  chicagowhitesox: "145",
  cincinnatireds: "113",
  clevelandguardians: "114",
  clevelandindians: "114",
  coloradorockies: "115",
  detroittigers: "116",
  houstonastros: "117",
  kansascityroyals: "118",
  losangelesangels: "108",
  anaheimangels: "108",
  losangelesdodgers: "119",
  miamimarlins: "146",
  floridamarlins: "146",
  milwaukeebrewers: "158",
  minnesotatwins: "142",
  newyorkmets: "121",
  newyorkyankees: "147",
  oaklandathletics: "133",
  athletics: "133",
  philadelphiaphillies: "143",
  pittsburghpirates: "134",
  sandiegopadres: "135",
  seattlemariners: "136",
  sanfranciscogiants: "137",
  stlouiscardinals: "138",
  tampabayrays: "139",
  texasrangers: "140",
  torontobluejays: "141",
  washingtonnationals: "120",
  ari: "109", atl: "144", bal: "110", bos: "111", chc: "112", cws: "145", cin: "113", cle: "114", col: "115", det: "116", hou: "117", kc: "118", laa: "108", lad: "119", mia: "146", mil: "158", min: "142", nym: "121", nyy: "147", oak: "133", phi: "143", pit: "134", sd: "135", sea: "136", sf: "137", stl: "138", tb: "139", tex: "140", tor: "141", wsh: "120", was: "120"
};

function baseUrl() {
  return (process.env.MLB_DATA_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function season() {
  const configured = Number(process.env.MLB_DATA_API_SEASON ?? new Date().getFullYear());
  return Number.isFinite(configured) ? String(configured) : String(new Date().getFullYear());
}

function maxPlayersPerTeam() {
  const configured = Number(process.env.MLB_DATA_API_MAX_PLAYERS_PER_TEAM ?? 28);
  return Number.isFinite(configured) ? Math.max(8, Math.min(40, configured)) : 28;
}

function teamIdFor(teamName: string) {
  const key = normalizeMlbTeam(teamName);
  return TEAM_IDS[key] ?? null;
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function num(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function side(value: unknown, fallback: "L" | "R" | "S" | "unknown") {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "L" || normalized === "R" || normalized === "S") return normalized;
  return fallback;
}

function throwsSide(value: unknown, fallback: "L" | "R" | "unknown") {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized === "L" || normalized === "R") return normalized;
  return fallback;
}

function endpointUrl(endpoint: string, params: Record<string, string>) {
  const url = new URL(`${baseUrl()}/json/named.${endpoint}.bam`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function fetchJson(url: URL) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 SharkEdge/1.5" },
    cache: "force-cache",
    next: { revalidate: Number(process.env.MLB_DATA_API_CACHE_TTL_SECONDS ?? CACHE_TTL_SECONDS) }
  });
  if (!response.ok) throw new Error(`MLB Data API request failed: HTTP ${response.status}`);
  return response.json();
}

function rowsFromQueryResults(body: any, endpoint: string): RawRow[] {
  const query = body?.[endpoint]?.queryResults;
  const row = query?.row;
  if (!row) return [];
  return Array.isArray(row) ? row : [row];
}

async function fetchRoster(teamId: string) {
  const url = endpointUrl("roster_40", {
    team_id: `'${teamId}'`,
    "roster_40.col_in": "player_id,name_display_first_last,name_first,name_last,position_txt,bats,throws,team_name,team_abbrev,team_id,status_code,starter_sw"
  });
  return rowsFromQueryResults(await fetchJson(url), "roster_40");
}

async function fetchStat(endpoint: "proj_pecota_batting" | "proj_pecota_pitching", playerId: string) {
  try {
    const url = endpointUrl(endpoint, { season: `'${season()}'`, player_id: `'${playerId}'` });
    return rowsFromQueryResults(await fetchJson(url), endpoint)[0] ?? null;
  } catch {
    return null;
  }
}

function statusFrom(row: RawRow): MlbPlayerProfile["status"] {
  const raw = String(row.status ?? row.status_code ?? "active").toLowerCase();
  if (raw.includes("out") || raw.includes("injured") || raw === "il" || raw.includes("inactive")) return "out";
  if (raw.includes("doubt")) return "doubtful";
  if (raw.includes("question")) return "questionable";
  if (raw.includes("active") || raw === "a") return "available";
  return "unknown";
}

function roleFrom(roster: RawRow, playerType: MlbPlayerProfile["playerType"], projectedInnings: number, projectedPa: number): MlbPlayerProfile["role"] {
  const position = String(roster.position_txt ?? "").toUpperCase();
  const starter = String(roster.starter_sw ?? "").toUpperCase() === "Y";
  if (playerType === "starter" && (starter || projectedInnings >= 4.5)) return projectedInnings >= 5.5 ? "ace" : "starter";
  if (playerType === "reliever") return projectedInnings >= 0.8 ? "setup" : "closer";
  if (playerType === "hitter" && projectedPa >= 3) return "lineup";
  if (position === "P") return "setup";
  if (projectedPa > 0) return "bench";
  return "unknown";
}

function hitterProfile(roster: RawRow, stat: RawRow | null, index: number): MlbPlayerProfile {
  const games = Math.max(1, num(stat?.g, 120));
  const tpa = num(stat?.tpa, num(stat?.ab, 420) + num(stat?.bb, 45));
  const projectedPa = clamp(tpa / games, index < 9 ? 3.1 : 0.8, 4.8);
  const ab = Math.max(1, num(stat?.ab, tpa * 0.88));
  const hr = num(stat?.hr, 12);
  const so = num(stat?.so, 105);
  const bb = num(stat?.bb, 42);
  const sb = num(stat?.sb, 3);
  const ops = num(stat?.ops, 0.72);
  const obp = num(stat?.obp, 0.318);
  const slg = num(stat?.slg, 0.402);
  const avg = num(stat?.avg, 0.245);
  const iso = clamp(slg - avg, 0.045, 0.34);
  const kRate = clamp((so / Math.max(1, tpa)) * 100, 8, 38);
  const bbRate = clamp((bb / Math.max(1, tpa)) * 100, 2, 18);
  const wrcPlus = clamp(65 + (ops - 0.66) * 210 + (obp - 0.31) * 90 + (iso - 0.15) * 95, 55, 165);
  const xwoba = clamp(0.27 + (ops - 0.66) * 0.115 + (obp - 0.31) * 0.24, 0.245, 0.43);
  const hardHitRate = clamp(31 + iso * 82 + hr / Math.max(1, games) * 18, 25, 60);
  const barrelRate = clamp(3.4 + iso * 38 + hr / Math.max(1, games) * 6, 1, 22);

  return {
    playerName: text(roster.name_display_first_last, `${roster.name_first ?? ""} ${roster.name_last ?? ""}`) ?? "Unknown MLB Player",
    teamName: text(roster.team_name, roster.team_abbrev) ?? "Unknown",
    role: projectedPa >= 3 ? "lineup" : "bench",
    playerType: "hitter",
    bats: side(roster.bats, "unknown"),
    throws: throwsSide(roster.throws, "unknown"),
    status: statusFrom(roster),
    projectedPa: Number(projectedPa.toFixed(2)),
    projectedInnings: 0,
    lineupSpot: index < 9 ? index + 1 : 0,
    wrcPlus: Number(wrcPlus.toFixed(2)),
    xwoba: Number(xwoba.toFixed(3)),
    isoPower: Number(iso.toFixed(3)),
    kRate: Number(kRate.toFixed(2)),
    bbRate: Number(bbRate.toFixed(2)),
    hardHitRate: Number(hardHitRate.toFixed(2)),
    barrelRate: Number(barrelRate.toFixed(2)),
    stolenBaseValue: clamp(sb / Math.max(1, games) * 12, -1, 5),
    defenseValue: 0,
    pitcherEraMinus: 100,
    pitcherXFip: 4.2,
    pitcherKRate: 22,
    pitcherBbRate: 8,
    groundBallRate: 43,
    platoonVsLhp: 0,
    platoonVsRhp: 0,
    fatigueRisk: projectedPa > 4.4 ? 0.24 : 0.12,
    leverageIndex: 0,
    source: "real"
  };
}

function parseIp(value: unknown) {
  const raw = String(value ?? "0");
  if (!raw.includes(".")) return num(raw, 0);
  const [whole, frac] = raw.split(".");
  const outs = Number(frac ?? 0);
  return Number(whole || 0) + (outs === 2 ? 2 / 3 : outs === 1 ? 1 / 3 : 0);
}

function pitcherProfile(roster: RawRow, stat: RawRow | null, index: number): MlbPlayerProfile {
  const games = Math.max(1, num(stat?.g, 45));
  const starts = num(stat?.gs, String(roster.starter_sw ?? "").toUpperCase() === "Y" ? 24 : 0);
  const innings = parseIp(stat?.ip ?? stat?.outs ? Number(stat?.outs) / 3 : starts > 0 ? 135 : 45);
  const projectedInnings = starts > 0 ? clamp(innings / Math.max(1, starts), 3.8, 6.6) : clamp(innings / games, 0.2, 1.4);
  const so = num(stat?.so, starts > 0 ? 120 : 45);
  const bb = num(stat?.bb, starts > 0 ? 45 : 18);
  const hr = num(stat?.hr, starts > 0 ? 18 : 7);
  const era = num(stat?.era, 4.2);
  const whip = num(stat?.whip, 1.28);
  const batters = Math.max(1, num(stat?.pa, stat?.tbf ?? innings * 4.25));
  const kRate = clamp((so / batters) * 100, 8, 39);
  const bbRate = clamp((bb / batters) * 100, 2, 18);
  const hr9 = innings > 0 ? (hr * 9) / innings : 1.1;
  const pitcherXFip = clamp(3.15 + hr9 * 0.42 + bbRate * 0.055 - kRate * 0.045, 2.4, 6.2);
  const pitcherEraMinus = clamp(era / 4.25 * 100, 48, 155);
  const playerType: MlbPlayerProfile["playerType"] = starts > 0 || projectedInnings >= 3.5 ? "starter" : "reliever";

  return {
    playerName: text(roster.name_display_first_last, `${roster.name_first ?? ""} ${roster.name_last ?? ""}`) ?? "Unknown MLB Pitcher",
    teamName: text(roster.team_name, roster.team_abbrev) ?? "Unknown",
    role: roleFrom(roster, playerType, projectedInnings, 0),
    playerType,
    bats: side(roster.bats, "unknown"),
    throws: throwsSide(roster.throws, "unknown"),
    status: statusFrom(roster),
    projectedPa: 0,
    projectedInnings: Number(projectedInnings.toFixed(2)),
    lineupSpot: 0,
    wrcPlus: 100,
    xwoba: 0.315,
    isoPower: 0.16,
    kRate: 22,
    bbRate: 8,
    hardHitRate: 40,
    barrelRate: 8,
    stolenBaseValue: 0,
    defenseValue: 0,
    pitcherEraMinus: Number(pitcherEraMinus.toFixed(2)),
    pitcherXFip: Number(pitcherXFip.toFixed(2)),
    pitcherKRate: Number(kRate.toFixed(2)),
    pitcherBbRate: Number(bbRate.toFixed(2)),
    groundBallRate: clamp(45 - hr9 * 2 + whip * 1.4, 30, 58),
    platoonVsLhp: 0,
    platoonVsRhp: 0,
    fatigueRisk: starts > 0 ? 0.18 : clamp(projectedInnings * 0.18, 0.08, 0.38),
    leverageIndex: playerType === "reliever" ? clamp(1.05 + (3.9 - pitcherXFip) * 0.18, 0.6, 2.2) : 0,
    source: "real"
  };
}

export async function getMlbDataApiTeamPlayerProfiles(teamName: string): Promise<MlbPlayerProfile[] | null> {
  const teamId = teamIdFor(teamName);
  if (!teamId) return null;
  const cacheKey = `mlb:data-api:team-player-profiles:${season()}:${teamId}:v1`;
  const cached = await readHotCache<MlbPlayerProfile[]>(cacheKey);
  if (cached) return cached;

  try {
    const roster = await fetchRoster(teamId);
    if (!roster.length) return null;
    const limited = roster.slice(0, maxPlayersPerTeam());
    const stats = await Promise.all(limited.map(async (row) => {
      const playerId = text(row.player_id);
      if (!playerId) return { row, stat: null };
      const isPitcher = String(row.position_txt ?? "").toUpperCase() === "P";
      return { row, stat: await fetchStat(isPitcher ? "proj_pecota_pitching" : "proj_pecota_batting", playerId) };
    }));

    const profiles = stats.map(({ row, stat }, index) => {
      const isPitcher = String(row.position_txt ?? "").toUpperCase() === "P";
      return isPitcher ? pitcherProfile(row, stat, index) : hitterProfile(row, stat, index);
    });
    await writeHotCache(cacheKey, profiles, CACHE_TTL_SECONDS);
    return profiles;
  } catch {
    return null;
  }
}

export async function getMlbDataApiDebugPayload(teamName: string): Promise<MlbDataApiDebugPayload> {
  const normalizedTeamKey = normalizeMlbTeam(teamName);
  const teamId = teamIdFor(teamName);
  if (!teamId) {
    return { ok: false, teamName, normalizedTeamKey, teamId: null, baseUrl: baseUrl(), rosterCount: 0, profileCount: 0, samplePlayers: [], error: "No MLB team_id mapping for this team name." };
  }
  try {
    const roster = await fetchRoster(teamId);
    const profiles = await getMlbDataApiTeamPlayerProfiles(teamName);
    return {
      ok: Boolean(profiles?.length),
      teamName,
      normalizedTeamKey,
      teamId,
      baseUrl: baseUrl(),
      rosterCount: roster.length,
      profileCount: profiles?.length ?? 0,
      samplePlayers: (profiles ?? []).slice(0, 12).map((player) => ({
        playerName: player.playerName,
        teamName: player.teamName,
        playerType: player.playerType,
        role: player.role,
        projectedPa: player.projectedPa,
        projectedInnings: player.projectedInnings,
        source: player.source
      }))
    };
  } catch (error) {
    return {
      ok: false,
      teamName,
      normalizedTeamKey,
      teamId,
      baseUrl: baseUrl(),
      rosterCount: 0,
      profileCount: 0,
      samplePlayers: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
