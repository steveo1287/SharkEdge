import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type LeagueKey = "MLB" | "NBA";

export type MlbIngestResult = {
  gamePk: number;
  status: "ok" | "skip" | "error";
  reason?: string;
};

export type NbaIngestResult = {
  eventId: string;
  status: "ok" | "skip" | "error";
  reason?: string;
  teamStatsWritten?: number;
  playerStatsWritten?: number;
  playerStatsSkipped?: number;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeToken(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "SharkEdge/2.0 stats-ingest" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getLeague(key: LeagueKey) {
  return prisma.league.findUnique({ where: { key } });
}

async function findOrCreateTeam(args: {
  leagueId: string;
  name: string;
  abbreviation: string;
  externalIdKey: string;
  externalIdValue: string;
}) {
  const teamKey = `${args.leagueId}:${args.externalIdKey}:${args.externalIdValue}`;
  const existing = await prisma.team.findFirst({
    where: {
      leagueId: args.leagueId,
      OR: [
        { key: teamKey },
        { externalIds: { path: [args.externalIdKey], equals: args.externalIdValue } },
        { name: { equals: args.name, mode: "insensitive" } }
      ]
    }
  });

  if (existing) {
    await prisma.team.update({
      where: { id: existing.id },
      data: {
        abbreviation: args.abbreviation,
        externalIds: toJson({
          ...((existing.externalIds as JsonRecord | null) ?? {}),
          [args.externalIdKey]: args.externalIdValue
        })
      }
    });
    return { id: existing.id };
  }

  return prisma.team.create({
    data: {
      leagueId: args.leagueId,
      key: teamKey,
      name: args.name,
      abbreviation: args.abbreviation,
      externalIds: toJson({ [args.externalIdKey]: args.externalIdValue })
    },
    select: { id: true }
  });
}

async function findOrCreateGame(args: {
  leagueId: string;
  externalEventId: string;
  homeTeamId: string;
  awayTeamId: string;
  startTime: Date;
  venue?: string | null;
  scoreJson?: JsonRecord | null;
}) {
  const existing = await prisma.game.findUnique({ where: { externalEventId: args.externalEventId } });
  if (existing) {
    const data: Record<string, unknown> = {
      homeTeamId: args.homeTeamId,
      awayTeamId: args.awayTeamId,
      startTime: args.startTime,
      status: "FINAL",
      venue: args.venue ?? existing.venue
    };
    if (args.scoreJson) data.scoreJson = toJson(args.scoreJson);
    await prisma.game.update({ where: { id: existing.id }, data });
    return { id: existing.id };
  }

  const data: Record<string, unknown> = {
    leagueId: args.leagueId,
    externalEventId: args.externalEventId,
    homeTeamId: args.homeTeamId,
    awayTeamId: args.awayTeamId,
    startTime: args.startTime,
    status: "FINAL",
    venue: args.venue ?? null
  };
  if (args.scoreJson) data.scoreJson = toJson(args.scoreJson);
  return prisma.game.create({ data, select: { id: true } });
}

async function upsertTeamGameStat(gameId: string, teamId: string, statsJson: JsonRecord) {
  const json = toJson(statsJson);
  return prisma.teamGameStat.upsert({
    where: { gameId_teamId: { gameId, teamId } },
    update: { statsJson: json },
    create: { gameId, teamId, statsJson: json }
  });
}

async function linkCompetitorToTeam(leagueKey: LeagueKey, teamName: string, teamId: string) {
  if (!teamName) return;
  await prisma.competitor.updateMany({
    where: {
      league: { key: leagueKey },
      teamId: null,
      name: { equals: teamName, mode: "insensitive" }
    },
    data: { teamId }
  });
}

type MlbScheduleResponse = {
  dates?: Array<{
    games?: Array<{
      gamePk?: number;
      gameDate?: string;
      status?: { abstractGameState?: string; detailedState?: string };
      venue?: { name?: string };
      teams?: {
        home?: { team?: { id?: number; name?: string; abbreviation?: string }; score?: number };
        away?: { team?: { id?: number; name?: string; abbreviation?: string }; score?: number };
      };
    }>;
  }>;
};

type MlbBoxscoreTeam = {
  team?: { id?: number; name?: string; abbreviation?: string };
  teamStats?: {
    batting?: Record<string, unknown>;
    pitching?: Record<string, unknown>;
    fielding?: Record<string, unknown>;
  };
};

type MlbBoxscoreResponse = {
  teams?: { home?: MlbBoxscoreTeam; away?: MlbBoxscoreTeam };
};

function extractMlbTeamStats(team: MlbBoxscoreTeam, opponentRuns: number | null): JsonRecord {
  const batting = team.teamStats?.batting ?? {};
  const pitching = team.teamStats?.pitching ?? {};
  const fielding = team.teamStats?.fielding ?? {};
  const runs = readNumber(batting.runs);
  return {
    runs,
    R: runs,
    points: runs,
    PTS: runs,
    opp_points: opponentRuns,
    runs_allowed: opponentRuns,
    hits: readNumber(batting.hits),
    H: readNumber(batting.hits),
    doubles: readNumber(batting.doubles),
    triples: readNumber(batting.triples),
    homeRuns: readNumber(batting.homeRuns),
    HR: readNumber(batting.homeRuns),
    walks: readNumber(batting.baseOnBalls),
    strikeouts: readNumber(batting.strikeOuts),
    leftOnBase: readNumber(batting.leftOnBase),
    obp: readNumber(batting.obp),
    slg: readNumber(batting.slg),
    avg: readNumber(batting.avg),
    ops: readNumber(batting.ops),
    inningsPitched: readNumber(pitching.inningsPitched),
    earnedRuns: readNumber(pitching.earnedRuns),
    hitsAllowed: readNumber(pitching.hits),
    walksAllowed: readNumber(pitching.baseOnBalls),
    strikeoutsPitching: readNumber(pitching.strikeOuts),
    homeRunsAllowed: readNumber(pitching.homeRuns),
    pitchCount: readNumber(pitching.pitchesThrown),
    errors: readNumber(fielding.errors),
    source: "mlb_statsapi_boxscore"
  };
}

export async function ingestMlbTeamStats(gamePk: number, leagueId: string): Promise<MlbIngestResult> {
  let boxscore: MlbBoxscoreResponse;
  try {
    boxscore = await fetchJson<MlbBoxscoreResponse>(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
  } catch (err) {
    return { gamePk, status: "error", reason: err instanceof Error ? err.message : String(err) };
  }

  const homeRaw = boxscore.teams?.home;
  const awayRaw = boxscore.teams?.away;
  if (!homeRaw?.team || !awayRaw?.team) return { gamePk, status: "skip", reason: "Missing team data" };

  const homeExternalId = String(homeRaw.team.id ?? "");
  const awayExternalId = String(awayRaw.team.id ?? "");
  if (!homeExternalId || !awayExternalId) return { gamePk, status: "skip", reason: "Missing team IDs" };

  const [homeTeam, awayTeam] = await Promise.all([
    findOrCreateTeam({ leagueId, name: homeRaw.team.name ?? `Team ${homeExternalId}`, abbreviation: homeRaw.team.abbreviation ?? homeExternalId, externalIdKey: "mlb", externalIdValue: homeExternalId }),
    findOrCreateTeam({ leagueId, name: awayRaw.team.name ?? `Team ${awayExternalId}`, abbreviation: awayRaw.team.abbreviation ?? awayExternalId, externalIdKey: "mlb", externalIdValue: awayExternalId })
  ]);

  const homeRuns = readNumber(homeRaw.teamStats?.batting?.runs);
  const awayRuns = readNumber(awayRaw.teamStats?.batting?.runs);
  const game = await findOrCreateGame({
    leagueId,
    externalEventId: `mlb_${gamePk}`,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    startTime: new Date(),
    scoreJson: { homeScore: homeRuns, awayScore: awayRuns, source: "mlb_statsapi_boxscore" }
  });

  await Promise.all([
    upsertTeamGameStat(game.id, homeTeam.id, extractMlbTeamStats(homeRaw, awayRuns)),
    upsertTeamGameStat(game.id, awayTeam.id, extractMlbTeamStats(awayRaw, homeRuns)),
    linkCompetitorToTeam("MLB", homeRaw.team.name ?? "", homeTeam.id),
    linkCompetitorToTeam("MLB", awayRaw.team.name ?? "", awayTeam.id)
  ]);

  return { gamePk, status: "ok" };
}

export async function ingestMlbRecentGames(lookbackDays = 14): Promise<{ attempted: number; ok: number; skipped: number; errors: number; detail: MlbIngestResult[] }> {
  const league = await getLeague("MLB");
  if (!league) return { attempted: 0, ok: 0, skipped: 0, errors: 0, detail: [] };

  const endDate = new Date();
  const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  let schedule: MlbScheduleResponse;
  try {
    schedule = await fetchJson<MlbScheduleResponse>(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${fmt(startDate)}&endDate=${fmt(endDate)}&gameType=R,P,F,D,L,W`);
  } catch (err) {
    console.error("[mlb-ingest] Schedule fetch failed:", err);
    return { attempted: 0, ok: 0, skipped: 0, errors: 1, detail: [] };
  }

  const gamePks = (schedule.dates ?? [])
    .flatMap((date) => date.games ?? [])
    .filter((game) => game.status?.abstractGameState?.toLowerCase() === "final" && typeof game.gamePk === "number")
    .map((game) => game.gamePk as number);

  const detail: MlbIngestResult[] = [];
  for (const gamePk of gamePks) detail.push(await ingestMlbTeamStats(gamePk, league.id));
  return {
    attempted: detail.length,
    ok: detail.filter((row) => row.status === "ok").length,
    skipped: detail.filter((row) => row.status === "skip").length,
    errors: detail.filter((row) => row.status === "error").length,
    detail
  };
}

type EspnScoreboardCompetitor = {
  id?: string;
  homeAway?: string;
  score?: { value?: number } | string | number;
  team?: { id?: string; displayName?: string; shortDisplayName?: string; name?: string; abbreviation?: string };
  statistics?: Array<{ name?: string; label?: string; displayValue?: string }>;
};

type EspnScoreboardResponse = {
  events?: Array<{
    id?: string;
    date?: string;
    competitions?: Array<{
      status?: { type?: { completed?: boolean; state?: string } };
      venue?: { fullName?: string };
      competitors?: EspnScoreboardCompetitor[];
    }>;
  }>;
};

function readTeamScore(competitor: EspnScoreboardCompetitor) {
  return readNumber(typeof competitor.score === "object" && competitor.score !== null ? competitor.score.value : competitor.score);
}

function pickNbaTeamStat(competitor: EspnScoreboardCompetitor, terms: string[]) {
  const stats = Array.isArray(competitor.statistics) ? competitor.statistics : [];
  const normalizedTerms = terms.map(normalizeToken);
  const match = stats.find((stat) => {
    const name = normalizeToken(readString(stat.name) ?? "");
    const label = normalizeToken(readString(stat.label) ?? "");
    return normalizedTerms.some((term) => name.includes(term) || label.includes(term));
  });
  return match ? readNumber(match.displayValue) : null;
}

function estimatePossessions(args: { fga: number | null; fta: number | null; offensiveRebounds: number | null; turnovers: number | null }) {
  if (args.fga === null || args.fta === null || args.offensiveRebounds === null || args.turnovers === null) return null;
  return args.fga + 0.44 * args.fta - args.offensiveRebounds + args.turnovers;
}

function extractNbaTeamStats(competitor: EspnScoreboardCompetitor, opponentScore: number | null): JsonRecord {
  const score = readTeamScore(competitor);
  const fga = pickNbaTeamStat(competitor, ["fieldgoalsattempted", "fga"]);
  const fgm = pickNbaTeamStat(competitor, ["fieldgoalsmade", "fgm"]);
  const fta = pickNbaTeamStat(competitor, ["freethrowsattempted", "fta"]);
  const ftm = pickNbaTeamStat(competitor, ["freethrowsmade", "ftm"]);
  const offensiveRebounds = pickNbaTeamStat(competitor, ["offensiverebounds", "oreb"]);
  const turnovers = pickNbaTeamStat(competitor, ["turnovers", "to"]);
  const possessions = estimatePossessions({ fga, fta, offensiveRebounds, turnovers });
  return {
    points: score,
    PTS: score,
    opp_points: opponentScore,
    oppPTS: opponentScore,
    rebounds: pickNbaTeamStat(competitor, ["totalrebounds", "rebounds", "reb"]),
    REB: pickNbaTeamStat(competitor, ["totalrebounds", "rebounds", "reb"]),
    assists: pickNbaTeamStat(competitor, ["assists", "ast"]),
    AST: pickNbaTeamStat(competitor, ["assists", "ast"]),
    turnovers,
    TO: turnovers,
    fieldGoalsMade: fgm,
    FGM: fgm,
    fieldGoalsAttempted: fga,
    FGA: fga,
    freeThrowsMade: ftm,
    FTM: ftm,
    freeThrowsAttempted: fta,
    FTA: fta,
    offensiveRebounds,
    OREB: offensiveRebounds,
    threes: pickNbaTeamStat(competitor, ["threepointfieldgoalsmade", "3pm", "fg3m"]),
    FG3M: pickNbaTeamStat(competitor, ["threepointfieldgoalsmade", "3pm", "fg3m"]),
    possessions,
    pace: possessions,
    dataQuality: { source: "espn_scoreboard", hasEstimatedPossessions: possessions !== null }
  };
}

export async function ingestNbaRecentGames(lookbackDays = 14): Promise<{ attempted: number; ok: number; skipped: number; errors: number; playerStatsWritten: number; detail: NbaIngestResult[] }> {
  const league = await getLeague("NBA");
  if (!league) return { attempted: 0, ok: 0, skipped: 0, errors: 0, playerStatsWritten: 0, detail: [] };

  const detail: NbaIngestResult[] = [];
  for (let day = 0; day < lookbackDays; day += 1) {
    const date = new Date(Date.now() - day * 24 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");
    let scoreboard: EspnScoreboardResponse;
    try {
      scoreboard = await fetchJson<EspnScoreboardResponse>(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`);
    } catch (err) {
      detail.push({ eventId: date, status: "error", reason: err instanceof Error ? err.message : String(err) });
      continue;
    }

    for (const event of scoreboard.events ?? []) {
      const competition = event.competitions?.[0];
      const eventId = readString(event.id) ?? date;
      if (!competition?.status?.type?.completed) {
        detail.push({ eventId, status: "skip", reason: "Not completed" });
        continue;
      }
      const competitors = competition.competitors ?? [];
      const home = competitors.find((competitor) => competitor.homeAway === "home");
      const away = competitors.find((competitor) => competitor.homeAway === "away");
      if (!home?.team?.id || !away?.team?.id) {
        detail.push({ eventId, status: "skip", reason: "Missing teams" });
        continue;
      }

      try {
        const [homeTeam, awayTeam] = await Promise.all([
          findOrCreateTeam({ leagueId: league.id, name: home.team.displayName ?? home.team.name ?? `Team ${home.team.id}`, abbreviation: home.team.abbreviation ?? home.team.id, externalIdKey: "espn", externalIdValue: home.team.id }),
          findOrCreateTeam({ leagueId: league.id, name: away.team.displayName ?? away.team.name ?? `Team ${away.team.id}`, abbreviation: away.team.abbreviation ?? away.team.id, externalIdKey: "espn", externalIdValue: away.team.id })
        ]);
        const homeScore = readTeamScore(home);
        const awayScore = readTeamScore(away);
        const game = await findOrCreateGame({
          leagueId: league.id,
          externalEventId: `espn_nba_${eventId}`,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          startTime: event.date ? new Date(event.date) : new Date(),
          venue: competition.venue?.fullName ?? null,
          scoreJson: { homeScore, awayScore, source: "espn_scoreboard" }
        });
        await Promise.all([
          upsertTeamGameStat(game.id, homeTeam.id, extractNbaTeamStats(home, awayScore)),
          upsertTeamGameStat(game.id, awayTeam.id, extractNbaTeamStats(away, homeScore)),
          linkCompetitorToTeam("NBA", home.team.displayName ?? home.team.name ?? "", homeTeam.id),
          linkCompetitorToTeam("NBA", away.team.displayName ?? away.team.name ?? "", awayTeam.id)
        ]);
        detail.push({ eventId, status: "ok", teamStatsWritten: 2, playerStatsWritten: 0, playerStatsSkipped: 0 });
      } catch (err) {
        detail.push({ eventId, status: "error", reason: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return {
    attempted: detail.length,
    ok: detail.filter((row) => row.status === "ok").length,
    skipped: detail.filter((row) => row.status === "skip").length,
    errors: detail.filter((row) => row.status === "error").length,
    playerStatsWritten: 0,
    detail
  };
}

export async function ingestTeamStats(args: { leagues?: LeagueKey[]; lookbackDays?: number } = {}) {
  const leagues = args.leagues ?? ["MLB", "NBA"];
  const lookbackDays = Math.max(1, Math.min(60, args.lookbackDays ?? 14));
  const results: Partial<Record<LeagueKey, Awaited<ReturnType<typeof ingestMlbRecentGames>> | Awaited<ReturnType<typeof ingestNbaRecentGames>>>> = {};

  if (leagues.includes("MLB")) results.MLB = await ingestMlbRecentGames(lookbackDays);
  if (leagues.includes("NBA")) results.NBA = await ingestNbaRecentGames(lookbackDays);
  return results;
}
