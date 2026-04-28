import { prisma } from "@/lib/db/prisma";

type JsonRecord = Record<string, unknown>;

type ScheduleGame = {
  gamePk: number;
  gameDate: string;
  status?: { abstractGameState?: string; detailedState?: string };
  teams?: {
    home?: ScheduleTeamBlock;
    away?: ScheduleTeamBlock;
  };
};

type ScheduleTeamBlock = {
  team?: { id?: number; name?: string; abbreviation?: string };
  probablePitcher?: { id?: number; fullName?: string };
};

type ScheduleResponse = {
  dates?: Array<{ games?: ScheduleGame[] }>;
};

type BoxscoreResponse = {
  teams?: {
    home?: { battingOrder?: Array<number | string>; pitchers?: Array<number | string> };
    away?: { battingOrder?: Array<number | string>; pitchers?: Array<number | string> };
  };
};

export type MlbStarterLineupLock = {
  eventId: string;
  gamePk: number | null;
  status: "LOCKED" | "PARTIAL" | "STALE" | "CHANGED" | "UNKNOWN";
  confidence: number;
  starterTrustMultiplier: number;
  lineupTrustMultiplier: number;
  homeLineupLocked: boolean;
  awayLineupLocked: boolean;
  homeStoredStarter: string | null;
  awayStoredStarter: string | null;
  homeCurrentStarter: string | null;
  awayCurrentStarter: string | null;
  homeStarterChanged: boolean;
  awayStarterChanged: boolean;
  openerRisk: boolean;
  bullpenGameRisk: boolean;
  staleProbables: boolean;
  checkedAt: string;
  drivers: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameName(a: string | null, b: string | null) {
  const aa = normalize(a);
  const bb = normalize(b);
  if (!aa || !bb) return false;
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "SharkEdge/2.0 mlb-starter-lineup-lock" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fmtDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function externalMlbId(team: { externalIds: unknown }) {
  return readString(asRecord(team.externalIds).mlb);
}

function teamNameMatches(scheduleTeam: ScheduleTeamBlock | undefined, dbTeam: { name: string; abbreviation: string; externalIds: unknown }) {
  const mlbId = externalMlbId(dbTeam);
  const scheduleId = scheduleTeam?.team?.id ? String(scheduleTeam.team.id) : null;
  if (mlbId && scheduleId && mlbId === scheduleId) return true;
  const scheduleName = scheduleTeam?.team?.name ?? null;
  const scheduleAbbr = scheduleTeam?.team?.abbreviation ?? null;
  return sameName(scheduleName ?? null, dbTeam.name) || sameName(scheduleAbbr ?? null, dbTeam.abbreviation);
}

async function findScheduleGame(args: {
  eventStartTime: Date;
  homeTeam: { name: string; abbreviation: string; externalIds: unknown };
  awayTeam: { name: string; abbreviation: string; externalIds: unknown };
}) {
  const date = fmtDate(args.eventStartTime);
  const schedule = await fetchJson<ScheduleResponse>(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team`);
  const games = (schedule?.dates ?? []).flatMap((day) => day.games ?? []);
  return games.find((game) => teamNameMatches(game.teams?.home, args.homeTeam) && teamNameMatches(game.teams?.away, args.awayTeam)) ?? null;
}

async function getBoxscore(gamePk: number) {
  return fetchJson<BoxscoreResponse>(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
}

async function latestStoredProbable(teamId: string) {
  const row = await prisma.teamGameStat.findFirst({
    where: { teamId },
    orderBy: { updatedAt: "desc" },
    select: { statsJson: true, updatedAt: true }
  });
  const stats = asRecord(row?.statsJson);
  return {
    name: readString(stats.probablePitcherName),
    mlbId: readString(stats.probablePitcherId),
    updatedAt: row?.updatedAt ?? null
  };
}

function buildUnknown(eventId: string, drivers: string[]): MlbStarterLineupLock {
  return {
    eventId,
    gamePk: null,
    status: "UNKNOWN",
    confidence: 0.25,
    starterTrustMultiplier: 0.55,
    lineupTrustMultiplier: 0.65,
    homeLineupLocked: false,
    awayLineupLocked: false,
    homeStoredStarter: null,
    awayStoredStarter: null,
    homeCurrentStarter: null,
    awayCurrentStarter: null,
    homeStarterChanged: false,
    awayStarterChanged: false,
    openerRisk: true,
    bullpenGameRisk: false,
    staleProbables: true,
    checkedAt: new Date().toISOString(),
    drivers
  };
}

export async function buildMlbStarterLineupLock(args: {
  eventId: string;
  homeTeamId: string;
  awayTeamId: string;
}): Promise<MlbStarterLineupLock> {
  const [event, homeTeam, awayTeam, homeStored, awayStored] = await Promise.all([
    prisma.event.findUnique({ where: { id: args.eventId }, select: { id: true, startTime: true } }),
    prisma.team.findUnique({ where: { id: args.homeTeamId }, select: { name: true, abbreviation: true, externalIds: true } }),
    prisma.team.findUnique({ where: { id: args.awayTeamId }, select: { name: true, abbreviation: true, externalIds: true } }),
    latestStoredProbable(args.homeTeamId),
    latestStoredProbable(args.awayTeamId)
  ]);

  if (!event || !homeTeam || !awayTeam) {
    return buildUnknown(args.eventId, ["MLB starter/lineup lock unavailable: event or teams missing."]);
  }

  const scheduleGame = await findScheduleGame({ eventStartTime: event.startTime, homeTeam, awayTeam });
  if (!scheduleGame) {
    return buildUnknown(args.eventId, ["MLB starter/lineup lock unavailable: no matching MLB StatsAPI schedule game found."]);
  }

  const boxscore = await getBoxscore(scheduleGame.gamePk);
  const homeCurrentStarter = readString(scheduleGame.teams?.home?.probablePitcher?.fullName);
  const awayCurrentStarter = readString(scheduleGame.teams?.away?.probablePitcher?.fullName);
  const homeLineupLocked = (boxscore?.teams?.home?.battingOrder?.length ?? 0) >= 9;
  const awayLineupLocked = (boxscore?.teams?.away?.battingOrder?.length ?? 0) >= 9;
  const now = Date.now();
  const maxUpdatedAt = Math.max(homeStored.updatedAt?.getTime() ?? 0, awayStored.updatedAt?.getTime() ?? 0);
  const hoursSinceStored = maxUpdatedAt ? (now - maxUpdatedAt) / (1000 * 60 * 60) : 999;
  const hoursToStart = (event.startTime.getTime() - now) / (1000 * 60 * 60);
  const homeStarterChanged = Boolean(homeStored.name && homeCurrentStarter && !sameName(homeStored.name, homeCurrentStarter));
  const awayStarterChanged = Boolean(awayStored.name && awayCurrentStarter && !sameName(awayStored.name, awayCurrentStarter));
  const staleProbables = hoursSinceStored > 8 || (hoursToStart < 4 && (!homeCurrentStarter || !awayCurrentStarter));
  const openerRisk = !homeCurrentStarter || !awayCurrentStarter || /tbd|bullpen|opener/i.test(`${homeCurrentStarter ?? ""} ${awayCurrentStarter ?? ""}`);
  const bullpenGameRisk = openerRisk && hoursToStart < 8;

  let status: MlbStarterLineupLock["status"] = "UNKNOWN";
  if (homeStarterChanged || awayStarterChanged) status = "CHANGED";
  else if (staleProbables) status = "STALE";
  else if (homeLineupLocked && awayLineupLocked && homeCurrentStarter && awayCurrentStarter) status = "LOCKED";
  else if (homeCurrentStarter || awayCurrentStarter || homeLineupLocked || awayLineupLocked) status = "PARTIAL";

  const lineupScore = (homeLineupLocked ? 0.5 : 0) + (awayLineupLocked ? 0.5 : 0);
  const starterScore = (homeCurrentStarter ? 0.5 : 0) + (awayCurrentStarter ? 0.5 : 0);
  const changePenalty = homeStarterChanged || awayStarterChanged ? 0.32 : 0;
  const stalePenalty = staleProbables ? 0.18 : 0;
  const openerPenalty = openerRisk ? 0.18 : 0;
  const confidence = clamp(0.25 + starterScore * 0.32 + lineupScore * 0.28 - changePenalty - stalePenalty - openerPenalty, 0.05, 1);
  const starterTrustMultiplier = clamp(0.45 + starterScore * 0.45 - changePenalty - openerPenalty * 0.5, 0.2, 1);
  const lineupTrustMultiplier = clamp(0.55 + lineupScore * 0.4 - stalePenalty, 0.35, 1);
  const drivers = [
    `MLB starter lock status ${status}.`,
    `Current starters: ${homeCurrentStarter ?? "unknown"} vs ${awayCurrentStarter ?? "unknown"}.`,
    `Stored starters: ${homeStored.name ?? "unknown"} vs ${awayStored.name ?? "unknown"}.`,
    `Lineups locked: home=${homeLineupLocked ? "yes" : "no"}, away=${awayLineupLocked ? "yes" : "no"}.`
  ];
  if (homeStarterChanged) drivers.push(`Home starter changed from ${homeStored.name} to ${homeCurrentStarter}.`);
  if (awayStarterChanged) drivers.push(`Away starter changed from ${awayStored.name} to ${awayCurrentStarter}.`);
  if (staleProbables) drivers.push(`Probable pitcher data is stale or incomplete; last stored update was ${hoursSinceStored.toFixed(1)} hours ago.`);
  if (openerRisk) drivers.push("Opener/bullpen-game risk detected because one or both current starters are missing/TBD.");

  return {
    eventId: args.eventId,
    gamePk: scheduleGame.gamePk,
    status,
    confidence: Number(confidence.toFixed(4)),
    starterTrustMultiplier: Number(starterTrustMultiplier.toFixed(4)),
    lineupTrustMultiplier: Number(lineupTrustMultiplier.toFixed(4)),
    homeLineupLocked,
    awayLineupLocked,
    homeStoredStarter: homeStored.name,
    awayStoredStarter: awayStored.name,
    homeCurrentStarter,
    awayCurrentStarter,
    homeStarterChanged,
    awayStarterChanged,
    openerRisk,
    bullpenGameRisk,
    staleProbables,
    checkedAt: new Date().toISOString(),
    drivers
  };
}
