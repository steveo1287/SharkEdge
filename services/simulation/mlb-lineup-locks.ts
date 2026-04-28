import { readHotCache, writeHotCache } from "@/lib/cache/live-cache";
import { normalizeMlbTeam } from "@/services/simulation/mlb-team-analytics";

export type MlbBullpenUsage = {
  inningsLast1: number;
  inningsLast3: number;
  inningsLast5: number;
  appearancesLast1: number;
  appearancesLast3: number;
  appearancesLast5: number;
  fatigueScore: number;
};

export type MlbLineupLock = {
  gameId?: string | null;
  gamePk?: number | null;
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
  awayBattingOrder: string[];
  homeBattingOrder: string[];
  awayLineupHandednessEdge: number;
  homeLineupHandednessEdge: number;
  awayLateScratches: string[];
  homeLateScratches: string[];
  awayBullpenUsage: MlbBullpenUsage;
  homeBullpenUsage: MlbBullpenUsage;
  lineupConfidence: number;
  starterConfidence: number;
  lockScore: number;
  volatilityAdjustment: number;
  notes: string[];
  source: "real" | "synthetic";
};

type RawLock = Record<string, unknown>;
type StatsApiTeam = { id?: number; name?: string; teamName?: string; abbreviation?: string };
type StatsApiPerson = { id?: number; fullName?: string; batSide?: { code?: string }; pitchHand?: { code?: string } };
type ScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  status?: { abstractGameState?: string; detailedState?: string; codedGameState?: string };
  teams?: {
    away?: { team?: StatsApiTeam; probablePitcher?: StatsApiPerson; splitSquad?: boolean };
    home?: { team?: StatsApiTeam; probablePitcher?: StatsApiPerson; splitSquad?: boolean };
  };
};
type ScheduleResponse = { dates?: Array<{ games?: ScheduleGame[] }> };
type LiveFeed = {
  gameData?: {
    status?: { abstractGameState?: string; detailedState?: string; codedGameState?: string };
    datetime?: { dateTime?: string };
    probablePitchers?: { away?: StatsApiPerson; home?: StatsApiPerson };
    players?: Record<string, StatsApiPerson>;
    teams?: { away?: StatsApiTeam; home?: StatsApiTeam };
  };
  liveData?: {
    boxscore?: {
      teams?: {
        away?: BoxTeam;
        home?: BoxTeam;
      };
    };
  };
};
type BoxTeam = {
  team?: StatsApiTeam;
  batters?: number[];
  pitchers?: number[];
  players?: Record<string, BoxPlayer>;
};
type BoxPlayer = {
  person?: StatsApiPerson;
  position?: { abbreviation?: string; type?: string };
  battingOrder?: string;
  status?: { code?: string; description?: string };
  gameStatus?: { isCurrentBatter?: boolean; isSubstitute?: boolean };
  stats?: { pitching?: { inningsPitched?: string; outs?: number } };
};

const CACHE_KEY = "mlb:lineup-locks:v4";
const CACHE_TTL_SECONDS = 60 * 10;
const OFFICIAL_CACHE_TTL_SECONDS = 60 * 5;
const DEFAULT_STATS_API_BASE_URL = "https://statsapi.mlb.com/api/v1";

const TEAM_IDS: Record<string, number> = {
  arizonadiamondbacks: 109,
  atlantabraves: 144,
  baltimoreorioles: 110,
  bostonredsox: 111,
  chicagocubs: 112,
  chicagowhitesox: 145,
  cincinnatireds: 113,
  clevelandguardians: 114,
  clevelandindians: 114,
  coloradorockies: 115,
  detroittigers: 116,
  houstonastros: 117,
  kansascityroyals: 118,
  losangelesangels: 108,
  anaheimangels: 108,
  losangelesdodgers: 119,
  miamimarlins: 146,
  floridamarlins: 146,
  milwaukeebrewers: 158,
  minnesotatwins: 142,
  newyorkmets: 121,
  newyorkyankees: 147,
  oaklandathletics: 133,
  athletics: 133,
  sacramentoathletics: 133,
  philadelphiaphillies: 143,
  pittsburghpirates: 134,
  sandiegopadres: 135,
  seattlemariners: 136,
  sanfranciscogiants: 137,
  stlouiscardinals: 138,
  tampabayrays: 139,
  texasrangers: 140,
  torontobluejays: 141,
  washingtonnationals: 120,
  ari: 109, atl: 144, bal: 110, bos: 111, chc: 112, cws: 145, cin: 113, cle: 114, col: 115, det: 116, hou: 117, kc: 118, laa: 108, lad: 119, mia: 146, mil: 158, min: 142, nym: 121, nyy: 147, oak: 133, phi: 143, pit: 134, sd: 135, sea: 136, sf: 137, stl: 138, tb: 139, tex: 140, tor: 141, wsh: 120, was: 120
};

const EMPTY_USAGE: MlbBullpenUsage = {
  inningsLast1: 0,
  inningsLast3: 0,
  inningsLast5: 0,
  appearancesLast1: 0,
  appearancesLast3: 0,
  appearancesLast5: 0,
  fatigueScore: 0
};

function statsApiBaseUrl() {
  return (process.env.MLB_STATS_API_BASE_URL?.trim() || DEFAULT_STATS_API_BASE_URL).replace(/\/$/, "");
}
function bool(value: unknown) {
  if (typeof value === "boolean") return value;
  const lower = String(value ?? "").toLowerCase();
  return ["true", "yes", "confirmed", "locked", "official", "posted"].includes(lower);
}
function num(value: unknown, fallback: number) { if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value); return fallback; }
function text(...values: unknown[]) { for (const value of values) if (typeof value === "string" && value.trim()) return value.trim(); return null; }
function throwsSide(value: unknown): "L" | "R" | "unknown" { const v = String(value ?? "").toUpperCase(); if (v === "L" || v === "R") return v; return "unknown"; }
function batSide(value: unknown): "L" | "R" | "S" | "unknown" { const v = String(value ?? "").toUpperCase(); if (v === "L" || v === "R" || v === "S") return v; return "unknown"; }
function stringArray(value: unknown) { if (Array.isArray(value)) return value.map(String).filter(Boolean); if (typeof value === "string" && value.includes(",")) return value.split(",").map((part) => part.trim()).filter(Boolean); return []; }
function keyFor(awayTeam: string, homeTeam: string) { return `${normalizeMlbTeam(awayTeam)}@${normalizeMlbTeam(homeTeam)}`; }
function rowsFromBody(body: any): RawLock[] { if (Array.isArray(body)) return body; if (Array.isArray(body?.games)) return body.games; if (Array.isArray(body?.lineups)) return body.lineups; if (Array.isArray(body?.data)) return body.data; return []; }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }
function dateOnly(date = new Date()) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
function teamIdFor(teamName: string) { return TEAM_IDS[normalizeMlbTeam(teamName)] ?? null; }
function teamMatches(apiTeam: StatsApiTeam | undefined, wanted: string) { if (!apiTeam) return false; const target = normalizeMlbTeam(wanted); return [apiTeam.name, apiTeam.teamName, apiTeam.abbreviation].some((value) => normalizeMlbTeam(String(value ?? "")) === target || normalizeMlbTeam(String(value ?? "")).endsWith(target) || target.endsWith(normalizeMlbTeam(String(value ?? "")))); }
function parseInnings(value: unknown) { const raw = String(value ?? "0"); if (!raw.includes(".")) return num(raw, 0); const [whole, frac] = raw.split("."); const outs = Number(frac ?? 0); return Number(whole || 0) + (outs === 2 ? 2 / 3 : outs === 1 ? 1 / 3 : 0); }

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SharkEdge/2.0 mlb-lineup-locks" } });
  if (!response.ok) throw new Error(`MLB StatsAPI failed ${response.status}`);
  return (await response.json()) as T;
}

function syntheticLock(awayTeam: string, homeTeam: string): MlbLineupLock {
  return {
    awayTeam,
    homeTeam,
    gamePk: null,
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
    awayBattingOrder: [],
    homeBattingOrder: [],
    awayLineupHandednessEdge: 0,
    homeLineupHandednessEdge: 0,
    awayLateScratches: [],
    homeLateScratches: [],
    awayBullpenUsage: EMPTY_USAGE,
    homeBullpenUsage: EMPTY_USAGE,
    lineupConfidence: 20,
    starterConfidence: 20,
    lockScore: 0.2,
    volatilityAdjustment: 1.28,
    notes: ["No official MLB lineup/starter feed matched this game; winner confidence is capped."],
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
  const lockScore = clamp((lineupConfidence + starterConfidence) / 200, 0, 1);
  return {
    gameId: text(row.gameId, row.eventId, row.id),
    gamePk: typeof row.gamePk === "number" ? row.gamePk : null,
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
    awayBattingOrder: stringArray(row.awayBattingOrder ?? row.away_batting_order ?? row.awayLineupPlayers ?? row.away_lineup),
    homeBattingOrder: stringArray(row.homeBattingOrder ?? row.home_batting_order ?? row.homeLineupPlayers ?? row.home_lineup),
    awayLineupHandednessEdge: num(row.awayLineupHandednessEdge, 0),
    homeLineupHandednessEdge: num(row.homeLineupHandednessEdge, 0),
    awayLateScratches: stringArray(row.awayLateScratches ?? row.away_late_scratches),
    homeLateScratches: stringArray(row.homeLateScratches ?? row.home_late_scratches),
    awayBullpenUsage: EMPTY_USAGE,
    homeBullpenUsage: EMPTY_USAGE,
    lineupConfidence,
    starterConfidence,
    lockScore,
    volatilityAdjustment: Number((1.25 - lockScore * 0.35).toFixed(2)),
    notes: [awayStarterLocked && homeStarterLocked ? "Both probable starters are locked." : "Probable starter uncertainty remains.", awayLineupLocked && homeLineupLocked ? "Both lineups are confirmed." : "Lineup uncertainty remains."],
    source: "real"
  };
}

function playerFromBox(team: BoxTeam | undefined, id: number) {
  return team?.players?.[`ID${id}`];
}

function battingOrder(team: BoxTeam | undefined) {
  const players = Object.values(team?.players ?? {})
    .filter((player) => typeof player.battingOrder === "string" && player.battingOrder.length > 0)
    .sort((a, b) => Number(a.battingOrder) - Number(b.battingOrder));
  return players.map((player) => player.person?.fullName ?? "Unknown").filter(Boolean);
}

function lineupPlayers(team: BoxTeam | undefined) {
  const ordered = battingOrder(team);
  if (ordered.length) return ordered;
  return (team?.batters ?? []).map((id) => playerFromBox(team, id)?.person?.fullName).filter((name): name is string => Boolean(name));
}

function lineupBats(team: BoxTeam | undefined) {
  const ids = team?.batters ?? [];
  return ids.map((id) => batSide(playerFromBox(team, id)?.person?.batSide?.code)).filter((side) => side !== "unknown");
}

function handednessEdge(lineupSides: Array<"L" | "R" | "S" | "unknown">, opposingStarterThrows: "L" | "R" | "unknown") {
  if (opposingStarterThrows === "unknown" || !lineupSides.length) return 0;
  let advantage = 0;
  for (const side of lineupSides) {
    if (side === "S") advantage += 0.55;
    else if (opposingStarterThrows === "R" && side === "L") advantage += 0.8;
    else if (opposingStarterThrows === "L" && side === "R") advantage += 0.8;
    else advantage -= 0.35;
  }
  return Number(clamp(advantage / Math.max(1, lineupSides.length), -0.45, 0.75).toFixed(2));
}

function lateScratches(team: BoxTeam | undefined) {
  return Object.values(team?.players ?? {})
    .filter((player) => {
      const raw = `${player.status?.code ?? ""} ${player.status?.description ?? ""}`.toLowerCase();
      return raw.includes("scratch") || raw.includes("injured") || raw.includes("unavailable") || raw.includes("out");
    })
    .map((player) => player.person?.fullName ?? "Unknown")
    .filter(Boolean);
}

function bullpenUsageFromGames(entries: Array<{ daysAgo: number; innings: number; appearances: number }>): MlbBullpenUsage {
  const inningsLast1 = entries.filter((entry) => entry.daysAgo <= 1).reduce((sum, entry) => sum + entry.innings, 0);
  const inningsLast3 = entries.filter((entry) => entry.daysAgo <= 3).reduce((sum, entry) => sum + entry.innings, 0);
  const inningsLast5 = entries.filter((entry) => entry.daysAgo <= 5).reduce((sum, entry) => sum + entry.innings, 0);
  const appearancesLast1 = entries.filter((entry) => entry.daysAgo <= 1).reduce((sum, entry) => sum + entry.appearances, 0);
  const appearancesLast3 = entries.filter((entry) => entry.daysAgo <= 3).reduce((sum, entry) => sum + entry.appearances, 0);
  const appearancesLast5 = entries.filter((entry) => entry.daysAgo <= 5).reduce((sum, entry) => sum + entry.appearances, 0);
  const fatigueScore = clamp(inningsLast1 * 0.38 + inningsLast3 * 0.14 + inningsLast5 * 0.055 + appearancesLast1 * 0.12 + appearancesLast3 * 0.045, 0, 5.5);
  return {
    inningsLast1: Number(inningsLast1.toFixed(2)),
    inningsLast3: Number(inningsLast3.toFixed(2)),
    inningsLast5: Number(inningsLast5.toFixed(2)),
    appearancesLast1,
    appearancesLast3,
    appearancesLast5,
    fatigueScore: Number(fatigueScore.toFixed(2))
  };
}

async function fetchRecentBullpenUsage(teamId: number, asOfDate: Date) {
  const startDate = dateOnly(addDays(asOfDate, -5));
  const endDate = dateOnly(addDays(asOfDate, -1));
  const cacheKey = `mlb:bullpen-usage:v2:${teamId}:${endDate}`;
  const cached = await readHotCache<MlbBullpenUsage>(cacheKey);
  if (cached) return cached;

  try {
    const schedule = await fetchJson<ScheduleResponse>(`${statsApiBaseUrl()}/schedule?sportId=1&teamId=${teamId}&startDate=${startDate}&endDate=${endDate}`);
    const games = (schedule.dates ?? []).flatMap((date) => date.games ?? []).filter((game) => game.gamePk && game.status?.abstractGameState === "Final").slice(-6);
    const entries: Array<{ daysAgo: number; innings: number; appearances: number }> = [];
    await Promise.all(games.map(async (game) => {
      try {
        const feed = await fetchJson<LiveFeed>(`${statsApiBaseUrl().replace(/\/api\/v1$/, "")}/api/v1.1/game/${game.gamePk}/feed/live`);
        const awayTeamId = feed.gameData?.teams?.away?.id;
        const targetSide: "away" | "home" = awayTeamId === teamId ? "away" : "home";
        const box = feed.liveData?.boxscore?.teams?.[targetSide];
        const pitchers = (box?.pitchers ?? []).map((id) => playerFromBox(box, id)).filter((player): player is BoxPlayer => Boolean(player));
        const relievers = pitchers.slice(1);
        const innings = relievers.reduce((sum, player) => sum + parseInnings(player.stats?.pitching?.inningsPitched ?? ((player.stats?.pitching?.outs ?? 0) / 3)), 0);
        const daysAgo = Math.max(1, Math.ceil((asOfDate.getTime() - new Date(game.gameDate ?? asOfDate).getTime()) / 86_400_000));
        entries.push({ daysAgo, innings, appearances: relievers.length });
      } catch {
        // Ignore single-game boxscore failures; bullpen usage is a confidence enhancer, not a hard dependency.
      }
    }));
    const usage = bullpenUsageFromGames(entries);
    await writeHotCache(cacheKey, usage, 60 * 60 * 2);
    return usage;
  } catch {
    return EMPTY_USAGE;
  }
}

async function fetchScheduleGames(awayTeam: string, homeTeam: string) {
  const today = new Date();
  const startDate = dateOnly(addDays(today, -1));
  const endDate = dateOnly(addDays(today, 2));
  const awayId = teamIdFor(awayTeam);
  const homeId = teamIdFor(homeTeam);
  const queryTeam = awayId ?? homeId;
  const teamFilter = queryTeam ? `&teamId=${queryTeam}` : "";
  const url = `${statsApiBaseUrl()}/schedule?sportId=1${teamFilter}&startDate=${startDate}&endDate=${endDate}&hydrate=probablePitcher,team`;
  const body = await fetchJson<ScheduleResponse>(url);
  return (body.dates ?? []).flatMap((date) => date.games ?? []);
}

async function fetchOfficialLock(awayTeam: string, homeTeam: string): Promise<MlbLineupLock | null> {
  const cacheKey = `mlb:official-lock:v4:${keyFor(awayTeam, homeTeam)}:${dateOnly()}`;
  const cached = await readHotCache<MlbLineupLock>(cacheKey);
  if (cached) return cached;

  try {
    const games = await fetchScheduleGames(awayTeam, homeTeam);
    const game = games.find((item) => teamMatches(item.teams?.away?.team, awayTeam) && teamMatches(item.teams?.home?.team, homeTeam));
    if (!game?.gamePk) return null;
    const feed = await fetchJson<LiveFeed>(`${statsApiBaseUrl().replace(/\/api\/v1$/, "")}/api/v1.1/game/${game.gamePk}/feed/live`);
    const awayBox = feed.liveData?.boxscore?.teams?.away;
    const homeBox = feed.liveData?.boxscore?.teams?.home;
    const awayStarter = feed.gameData?.probablePitchers?.away ?? game.teams?.away?.probablePitcher ?? null;
    const homeStarter = feed.gameData?.probablePitchers?.home ?? game.teams?.home?.probablePitcher ?? null;
    const awayOrder = battingOrder(awayBox);
    const homeOrder = battingOrder(homeBox);
    const awayPlayers = lineupPlayers(awayBox);
    const homePlayers = lineupPlayers(homeBox);
    const awayStarterThrows = throwsSide(awayStarter?.pitchHand?.code);
    const homeStarterThrows = throwsSide(homeStarter?.pitchHand?.code);
    const awayLineupLocked = awayOrder.length >= 9 || awayPlayers.length >= 9;
    const homeLineupLocked = homeOrder.length >= 9 || homePlayers.length >= 9;
    const awayStarterLocked = Boolean(awayStarter?.fullName);
    const homeStarterLocked = Boolean(homeStarter?.fullName);
    const awayId = teamIdFor(awayTeam);
    const homeId = teamIdFor(homeTeam);
    const asOfDate = new Date(feed.gameData?.datetime?.dateTime ?? game.gameDate ?? new Date());
    const [awayBullpenUsage, homeBullpenUsage] = await Promise.all([
      awayId ? fetchRecentBullpenUsage(awayId, asOfDate) : Promise.resolve(EMPTY_USAGE),
      homeId ? fetchRecentBullpenUsage(homeId, asOfDate) : Promise.resolve(EMPTY_USAGE)
    ]);
    const awayLateScratches = lateScratches(awayBox);
    const homeLateScratches = lateScratches(homeBox);
    const lineupConfidence = clamp((awayLineupLocked ? 50 : 18) + (homeLineupLocked ? 50 : 18) - (awayLateScratches.length + homeLateScratches.length) * 6, 10, 100);
    const starterConfidence = clamp((awayStarterLocked ? 50 : 15) + (homeStarterLocked ? 50 : 15), 10, 100);
    const scratchPenalty = (awayLateScratches.length + homeLateScratches.length) * 0.045;
    const lockScore = clamp((lineupConfidence + starterConfidence) / 200 - scratchPenalty, 0, 1);
    const volatilityAdjustment = Number(clamp(1.28 - lockScore * 0.34 + scratchPenalty + (awayBullpenUsage.fatigueScore + homeBullpenUsage.fatigueScore) * 0.018, 0.92, 1.32).toFixed(2));
    const lock: MlbLineupLock = {
      gameId: String(game.gamePk),
      gamePk: game.gamePk,
      awayTeam,
      homeTeam,
      awayLineupLocked,
      homeLineupLocked,
      awayStarterLocked,
      homeStarterLocked,
      awayStarterName: awayStarter?.fullName ?? null,
      homeStarterName: homeStarter?.fullName ?? null,
      awayStarterThrows,
      homeStarterThrows,
      awayLineupPlayers: awayPlayers,
      homeLineupPlayers: homePlayers,
      awayBattingOrder: awayOrder,
      homeBattingOrder: homeOrder,
      awayLineupHandednessEdge: handednessEdge(lineupBats(awayBox), homeStarterThrows),
      homeLineupHandednessEdge: handednessEdge(lineupBats(homeBox), awayStarterThrows),
      awayLateScratches,
      homeLateScratches,
      awayBullpenUsage,
      homeBullpenUsage,
      lineupConfidence,
      starterConfidence,
      lockScore: Number(lockScore.toFixed(3)),
      volatilityAdjustment,
      notes: [
        awayStarterLocked && homeStarterLocked ? `Official probable starters: ${awayStarter?.fullName} vs ${homeStarter?.fullName}.` : "Official probable starter data incomplete.",
        awayLineupLocked && homeLineupLocked ? "Confirmed batting orders are posted for both teams." : "Starting lineups are still projected/not fully posted.",
        `Handedness edge: away ${handednessEdge(lineupBats(awayBox), homeStarterThrows)}, home ${handednessEdge(lineupBats(homeBox), awayStarterThrows)}.`,
        `Bullpen usage L1/L3/L5: away ${awayBullpenUsage.inningsLast1}/${awayBullpenUsage.inningsLast3}/${awayBullpenUsage.inningsLast5}, home ${homeBullpenUsage.inningsLast1}/${homeBullpenUsage.inningsLast3}/${homeBullpenUsage.inningsLast5}.`,
        awayLateScratches.length || homeLateScratches.length ? `Late scratch flags: ${[...awayLateScratches, ...homeLateScratches].join(", ")}.` : "No late scratch flags found in official boxscore feed."
      ],
      source: "real"
    };
    await writeHotCache(cacheKey, lock, OFFICIAL_CACHE_TTL_SECONDS);
    return lock;
  } catch {
    return null;
  }
}

async function fetchCustomLocks() {
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
  const official = await fetchOfficialLock(awayTeam, homeTeam);
  if (official) return official;
  const locks = await fetchCustomLocks();
  return locks?.[keyFor(awayTeam, homeTeam)] ?? syntheticLock(awayTeam, homeTeam);
}
