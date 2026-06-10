type JsonRecord = Record<string, unknown>;

export type MlbStatsApiStarterProjection = {
  playerId: string | null;
  name: string;
  team: string;
  teamSide: "away" | "home";
  innings: number | null;
  outs: number | null;
  strikeouts: number | null;
  earnedRuns: number | null;
  hitsAllowed: number | null;
  walks: number | null;
  homeRuns: number | null;
  actual: null;
};

export type MlbStatsApiStarterProjectionResult = {
  awayStarter: MlbStatsApiStarterProjection | null;
  homeStarter: MlbStatsApiStarterProjection | null;
  warnings: string[];
};

type TeamIdentity = {
  name: string;
  abbreviation?: string | null;
  externalIds?: unknown;
};

type ScheduleTeam = {
  team?: { id?: number; name?: string; abbreviation?: string };
  probablePitcher?: { id?: number; fullName?: string };
};

type ScheduleGame = {
  gamePk?: number;
  gameDate?: string;
  teams?: { away?: ScheduleTeam; home?: ScheduleTeam };
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function readString(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalize(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sameTeam(scheduleTeam: ScheduleTeam | undefined, team: TeamIdentity) {
  const externalId = readString(asRecord(team.externalIds).mlb);
  const scheduleId = scheduleTeam?.team?.id ? String(scheduleTeam.team.id) : null;
  if (externalId && scheduleId && externalId === scheduleId) return true;
  const scheduleName = normalize(scheduleTeam?.team?.name);
  const scheduleAbbr = normalize(scheduleTeam?.team?.abbreviation);
  const name = normalize(team.name);
  const abbr = normalize(team.abbreviation);
  return Boolean(
    (name && (scheduleName === name || scheduleName.includes(name) || name.includes(scheduleName))) ||
    (abbr && scheduleAbbr === abbr)
  );
}

function dateKey(value: Date | string | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7_500);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "SharkEdge/2.0 probable-pitcher-stat-projection" },
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseInnings(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const [wholeRaw, outsRaw] = value.split(".");
  const whole = Number(wholeRaw);
  const outs = Number(outsRaw ?? 0);
  if (!Number.isFinite(whole)) return null;
  if (outs === 1) return whole + 1 / 3;
  if (outs === 2) return whole + 2 / 3;
  return whole;
}

function round(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

async function pitcherSeasonStat(pitcherId: number, season: number) {
  const url = `https://statsapi.mlb.com/api/v1/people/${pitcherId}/stats?stats=season&group=pitching&season=${season}`;
  const json = await fetchJson<{ stats?: Array<{ splits?: Array<{ stat?: JsonRecord }> }> }>(url);
  return json?.stats?.[0]?.splits?.[0]?.stat ?? null;
}

function buildProjectionFromSeasonStat(args: {
  pitcherId: number;
  pitcherName: string;
  teamName: string;
  teamSide: "away" | "home";
  stat: JsonRecord | null;
}): MlbStatsApiStarterProjection | null {
  if (!args.stat) return null;
  const innings = parseInnings(args.stat.inningsPitched);
  const starts = readNumber(args.stat.gamesStarted);
  if (!innings || !starts || starts < 1) return null;

  const strikeouts = readNumber(args.stat.strikeOuts);
  const earnedRuns = readNumber(args.stat.earnedRuns);
  const hits = readNumber(args.stat.hits);
  const walks = readNumber(args.stat.baseOnBalls) ?? readNumber(args.stat.walks);
  const homeRuns = readNumber(args.stat.homeRuns);
  const ipPerStart = clamp(innings / starts, 1.5, 7.8);

  return {
    playerId: String(args.pitcherId),
    name: args.pitcherName,
    team: args.teamName,
    teamSide: args.teamSide,
    innings: round(ipPerStart, 2),
    outs: Math.round(ipPerStart * 3),
    strikeouts: round(strikeouts == null ? null : strikeouts / starts, 1),
    earnedRuns: round(earnedRuns == null ? null : earnedRuns / starts, 1),
    hitsAllowed: round(hits == null ? null : hits / starts, 1),
    walks: round(walks == null ? null : walks / starts, 1),
    homeRuns: round(homeRuns == null ? null : homeRuns / starts, 1),
    actual: null
  };
}

export async function buildMlbProbablePitcherStatProjections(args: {
  gameDate?: Date | string | null;
  awayTeam: TeamIdentity;
  homeTeam: TeamIdentity;
}): Promise<MlbStatsApiStarterProjectionResult> {
  const warnings: string[] = [];
  const date = dateKey(args.gameDate);
  const schedule = await fetchJson<{ dates?: Array<{ games?: ScheduleGame[] }> }>(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team`);
  const games = (schedule?.dates ?? []).flatMap((day) => day.games ?? []);
  const game = games.find((candidate) => sameTeam(candidate.teams?.away, args.awayTeam) && sameTeam(candidate.teams?.home, args.homeTeam)) ?? null;
  if (!game) {
    return { awayStarter: null, homeStarter: null, warnings: [`MLB Stats API probable pitcher lookup found no matching game for ${args.awayTeam.name} at ${args.homeTeam.name} on ${date}.`] };
  }

  const season = new Date(game.gameDate ?? `${date}T00:00:00Z`).getUTCFullYear();
  const awayProbable = game.teams?.away?.probablePitcher;
  const homeProbable = game.teams?.home?.probablePitcher;
  const [awayStat, homeStat] = await Promise.all([
    awayProbable?.id ? pitcherSeasonStat(awayProbable.id, season) : Promise.resolve(null),
    homeProbable?.id ? pitcherSeasonStat(homeProbable.id, season) : Promise.resolve(null)
  ]);

  const awayStarter = awayProbable?.id && awayProbable.fullName
    ? buildProjectionFromSeasonStat({ pitcherId: awayProbable.id, pitcherName: awayProbable.fullName, teamName: args.awayTeam.name, teamSide: "away", stat: awayStat })
    : null;
  const homeStarter = homeProbable?.id && homeProbable.fullName
    ? buildProjectionFromSeasonStat({ pitcherId: homeProbable.id, pitcherName: homeProbable.fullName, teamName: args.homeTeam.name, teamSide: "home", stat: homeStat })
    : null;

  if (!awayStarter) warnings.push(`MLB Stats API did not return enough season starter stats for ${awayProbable?.fullName ?? args.awayTeam.name}.`);
  if (!homeStarter) warnings.push(`MLB Stats API did not return enough season starter stats for ${homeProbable?.fullName ?? args.homeTeam.name}.`);
  if (awayStarter || homeStarter) warnings.push("Starter projections include MLB Stats API probable-pitcher season stats; no generic starter fallback was used.");

  return { awayStarter, homeStarter, warnings };
}
