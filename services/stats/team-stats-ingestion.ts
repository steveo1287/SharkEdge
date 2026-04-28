/**
 * Team + Player Stats Ingestion
 *
 * Fetches completed game boxscores from free public APIs and writes the stats
 * rows that SharkEdge sims consume.
 *
 * MLB  → statsapi.mlb.com (official, no auth required)
 * NBA  → site.api.espn.com scoreboard + summary endpoints
 *
 * Key sim rules:
 *   - TeamGameStat rows keep canonical sport keys plus aliases the sim reads.
 *   - NBA PlayerGameStat rows include minutes, PTS/REB/AST/3PM aliases, starter,
 *     and data-quality metadata so player prop sims can normalize workload.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type PlayerIngestCounters = {
  attempted: number;
  written: number;
  skipped: number;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const cleaned = value.replace(/,/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function splitMadeAttempted(value: unknown): { made: number | null; attempted: number | null } {
  if (typeof value !== "string") {
    return { made: null, attempted: null };
  }

  const match = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) {
    return { made: null, attempted: null };
  }

  return {
    made: Number(match[1]),
    attempted: Number(match[2])
  };
}

function parseMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 60 ? value / 60 : value;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const trimmed = value.trim();
  const clock = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (clock) {
    return Number(clock[1]) + Number(clock[2]) / 60;
  }

  const parsed = Number(trimmed.replace(/[^0-9.+-]/g, ""));
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed > 60 ? parsed / 60 : parsed;
}

function estimateBasketballPossessions(args: {
  fga: number | null;
  fta: number | null;
  offensiveRebounds: number | null;
  turnovers: number | null;
}) {
  if (
    typeof args.fga !== "number" ||
    typeof args.fta !== "number" ||
    typeof args.offensiveRebounds !== "number" ||
    typeof args.turnovers !== "number"
  ) {
    return null;
  }

  return args.fga + 0.44 * args.fta - args.offensiveRebounds + args.turnovers;
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "SharkEdge/2.0 stats-ingest" },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

// ─── League / Team / Game / Player helpers ──────────────────────────────────

async function getLeague(key: string) {
  return prisma.league.findUnique({ where: { key } });
}

async function findOrCreateTeam(args: {
  leagueId: string;
  name: string;
  abbreviation: string;
  externalIdKey: string;
  externalIdValue: string;
}): Promise<{ id: string }> {
  const { leagueId, name, abbreviation, externalIdKey, externalIdValue } = args;
  const teamKey = `${leagueId}:${externalIdKey}:${externalIdValue}`;

  const existing = await prisma.team.findFirst({
    where: {
      leagueId,
      OR: [
        { key: teamKey },
        { externalIds: { path: [externalIdKey], equals: externalIdValue } },
        { name: { equals: name, mode: "insensitive" } }
      ]
    }
  });

  if (existing) {
    await prisma.team.update({
      where: { id: existing.id },
      data: {
        abbreviation,
        externalIds: toJson({
          ...((existing.externalIds as JsonRecord | null) ?? {}),
          [externalIdKey]: externalIdValue
        })
      }
    });
    return { id: existing.id };
  }

  return prisma.team.create({
    data: {
      leagueId,
      key: teamKey,
      name,
      abbreviation,
      externalIds: toJson({ [externalIdKey]: externalIdValue })
    }
  });
}

async function findOrCreatePlayer(args: {
  leagueId: string;
  teamId: string;
  name: string;
  position?: string | null;
  externalIdKey: string;
  externalIdValue: string;
}): Promise<{ id: string }> {
  const { leagueId, teamId, name, position, externalIdKey, externalIdValue } = args;
  const playerKey = `${leagueId}:${externalIdKey}:${externalIdValue}`;
  const nameParts = name.split(/\s+/).filter(Boolean);

  const existing = await prisma.player.findFirst({
    where: {
      leagueId,
      OR: [
        { key: playerKey },
        { externalIds: { path: [externalIdKey], equals: externalIdValue } },
        { teamId, name: { equals: name, mode: "insensitive" } }
      ]
    }
  });

  if (existing) {
    return prisma.player.update({
      where: { id: existing.id },
      data: {
        teamId,
        position: position ?? existing.position,
        externalIds: toJson({
          ...((existing.externalIds as JsonRecord | null) ?? {}),
          [externalIdKey]: externalIdValue
        })
      },
      select: { id: true }
    });
  }

  return prisma.player.create({
    data: {
      leagueId,
      teamId,
      key: playerKey,
      name,
      firstName: nameParts[0] ?? null,
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : null,
      position: position ?? "UNK",
      externalIds: toJson({ [externalIdKey]: externalIdValue })
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
}): Promise<{ id: string }> {
  const existing = await prisma.game.findUnique({
    where: { externalEventId: args.externalEventId }
  });
  if (existing) {
    await prisma.game.update({
      where: { id: existing.id },
      data: {
        homeTeamId: args.homeTeamId,
        awayTeamId: args.awayTeamId,
        startTime: args.startTime,
        status: "FINAL",
        venue: args.venue ?? existing.venue,
        scoreJson: args.scoreJson ? toJson(args.scoreJson) : existing.scoreJson
      }
    });
    return { id: existing.id };
  }

  return prisma.game.create({
    data: {
      leagueId: args.leagueId,
      externalEventId: args.externalEventId,
      homeTeamId: args.homeTeamId,
      awayTeamId: args.awayTeamId,
      startTime: args.startTime,
      status: "FINAL",
      venue: args.venue ?? null,
      scoreJson: args.scoreJson ? toJson(args.scoreJson) : undefined
    }
  });
}

async function upsertTeamGameStat(gameId: string, teamId: string, statsJson: JsonRecord) {
  const json = toJson(statsJson);
  return prisma.teamGameStat.upsert({
    where: { gameId_teamId: { gameId, teamId } },
    update: { statsJson: json },
    create: { gameId, teamId, statsJson: json }
  });
}

async function upsertPlayerGameStat(args: {
  gameId: string;
  playerId: string;
  statsJson: JsonRecord;
  minutes: number | null;
  starter: boolean;
  outcomeStatus: string;
}) {
  return prisma.playerGameStat.upsert({
    where: { gameId_playerId: { gameId: args.gameId, playerId: args.playerId } },
    update: {
      statsJson: toJson(args.statsJson),
      minutes: args.minutes,
      starter: args.starter,
      outcomeStatus: args.outcomeStatus
    },
    create: {
      gameId: args.gameId,
      playerId: args.playerId,
      statsJson: toJson(args.statsJson),
      minutes: args.minutes,
      starter: args.starter,
      outcomeStatus: args.outcomeStatus
    }
  });
}

async function linkCompetitorToTeam(leagueKey: string, teamName: string, teamId: string) {
  await prisma.competitor.updateMany({
    where: {
      league: { key: leagueKey },
      teamId: null,
      name: { equals: teamName, mode: "insensitive" }
    },
    data: { teamId }
  });
}

// ─── MLB ─────────────────────────────────────────────────────────────────────

type MlbScheduleResponse = {
  dates?: Array<{
    games?: Array<{
      gamePk: number;
      gameDate: string;
      status?: { abstractGameState?: string; detailedState?: string };
      venue?: { name?: string };
      teams?: {
        home?: { team?: { id?: number; name?: string; abbreviation?: string }; score?: number };
        away?: { team?: { id?: number; name?: string; abbreviation?: string }; score?: number };
      };
    }>;
  }>;
};

type MlbBoxscoreResponse = {
  teams?: {
    home?: MlbBoxscoreTeam;
    away?: MlbBoxscoreTeam;
  };
};

type MlbBoxscoreTeam = {
  team?: { id?: number; name?: string; abbreviation?: string };
  teamStats?: {
    batting?: {
      runs?: number;
      hits?: number;
      doubles?: number;
      triples?: number;
      homeRuns?: number;
      rbi?: number;
      baseOnBalls?: number;
      strikeOuts?: number;
      leftOnBase?: number;
      obp?: string | number;
      slg?: string | number;
      avg?: string | number;
      ops?: string | number;
    };
    pitching?: {
      inningsPitched?: string | number;
      earnedRuns?: number;
      hits?: number;
      baseOnBalls?: number;
      strikeOuts?: number;
      homeRuns?: number;
      pitchesThrown?: number;
    };
    fielding?: {
      errors?: number;
    };
  };
};

function extractMlbTeamStats(team: MlbBoxscoreTeam): JsonRecord {
  const batting = team.teamStats?.batting ?? {};
  const pitching = team.teamStats?.pitching ?? {};
  const fielding = team.teamStats?.fielding ?? {};

  const inningsPitched = readNumber(pitching.inningsPitched);

  return {
    runs: readNumber(batting.runs),
    R: readNumber(batting.runs),
    hits: readNumber(batting.hits),
    H: readNumber(batting.hits),
    doubles: readNumber(batting.doubles),
    triples: readNumber(batting.triples),
    homeRuns: readNumber(batting.homeRuns),
    HR: readNumber(batting.homeRuns),
    rbi: readNumber(batting.rbi),
    walks: readNumber(batting.baseOnBalls),
    strikeouts: readNumber(batting.strikeOuts),
    leftOnBase: readNumber(batting.leftOnBase),
    obp: readNumber(batting.obp),
    slg: readNumber(batting.slg),
    avg: readNumber(batting.avg),
    ops: readNumber(batting.ops),
    inningsPitched,
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

export type MlbIngestResult = {
  gamePk: number;
  status: "ok" | "skip" | "error";
  reason?: string;
};

export async function ingestMlbTeamStats(
  gamePk: number,
  leagueId: string
): Promise<MlbIngestResult> {
  let boxscore: MlbBoxscoreResponse;
  try {
    boxscore = await fetchJson<MlbBoxscoreResponse>(
      `https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`
    );
  } catch (err) {
    return { gamePk, status: "error", reason: `Boxscore fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const homeRaw = boxscore.teams?.home;
  const awayRaw = boxscore.teams?.away;
  if (!homeRaw?.team || !awayRaw?.team) {
    return { gamePk, status: "skip", reason: "Missing team data in boxscore" };
  }

  const homeTeamId = String(homeRaw.team.id ?? "");
  const awayTeamId = String(awayRaw.team.id ?? "");
  if (!homeTeamId || !awayTeamId) {
    return { gamePk, status: "skip", reason: "Missing team IDs" };
  }

  const [homeTeam, awayTeam] = await Promise.all([
    findOrCreateTeam({
      leagueId,
      name: homeRaw.team.name ?? `Team ${homeTeamId}`,
      abbreviation: homeRaw.team.abbreviation ?? homeTeamId.slice(0, 3).toUpperCase(),
      externalIdKey: "mlb",
      externalIdValue: homeTeamId
    }),
    findOrCreateTeam({
      leagueId,
      name: awayRaw.team.name ?? `Team ${awayTeamId}`,
      abbreviation: awayRaw.team.abbreviation ?? awayTeamId.slice(0, 3).toUpperCase(),
      externalIdKey: "mlb",
      externalIdValue: awayTeamId
    })
  ]);

  const externalEventId = `mlb_${gamePk}`;
  const game = await findOrCreateGame({
    leagueId,
    externalEventId,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    startTime: new Date()
  });

  await Promise.all([
    upsertTeamGameStat(game.id, homeTeam.id, extractMlbTeamStats(homeRaw)),
    upsertTeamGameStat(game.id, awayTeam.id, extractMlbTeamStats(awayRaw))
  ]);

  await Promise.all([
    linkCompetitorToTeam("MLB", homeRaw.team.name ?? "", homeTeam.id),
    linkCompetitorToTeam("MLB", awayRaw.team.name ?? "", awayTeam.id)
  ]);

  return { gamePk, status: "ok" };
}

export async function ingestMlbRecentGames(lookbackDays = 14): Promise<{
  attempted: number;
  ok: number;
  skipped: number;
  errors: number;
  detail: MlbIngestResult[];
}> {
  const league = await getLeague("MLB");
  if (!league) {
    return { attempted: 0, ok: 0, skipped: 0, errors: 0, detail: [] };
  }

  const endDate = new Date();
  const startDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let schedule: MlbScheduleResponse;
  try {
    schedule = await fetchJson<MlbScheduleResponse>(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${fmt(startDate)}&endDate=${fmt(endDate)}&gameType=R,P,F,D,L,W`
    );
  } catch (err) {
    console.error("[mlb-ingest] Schedule fetch failed:", err);
    return { attempted: 0, ok: 0, skipped: 0, errors: 1, detail: [] };
  }

  const completedGamePks: number[] = [];
  for (const dateEntry of schedule.dates ?? []) {
    for (const game of dateEntry.games ?? []) {
      const state = game.status?.abstractGameState?.toLowerCase();
      if (state === "final" && game.gamePk) {
        completedGamePks.push(game.gamePk);
      }
    }
  }

  const detail: MlbIngestResult[] = [];
  for (const gamePk of completedGamePks) {
    const result = await ingestMlbTeamStats(gamePk, league.id);
    detail.push(result);
  }

  return {
    attempted: detail.length,
    ok: detail.filter((r) => r.status === "ok").length,
    skipped: detail.filter((r) => r.status === "skip").length,
    errors: detail.filter((r) => r.status === "error").length,
    detail
  };
}

// ─── NBA ─────────────────────────────────────────────────────────────────────

export type NbaIngestResult = {
  eventId: string;
  status: "ok" | "skip" | "error";
  reason?: string;
  teamStatsWritten?: number;
  playerStatsWritten?: number;
  playerStatsSkipped?: number;
};

type EspnTeam = {
  id?: string;
  displayName?: string;
  shortDisplayName?: string;
  name?: string;
  abbreviation?: string;
};

type EspnScoreboardCompetitor = {
  id?: string;
  homeAway?: string;
  score?: { value?: number } | string | number;
  team?: EspnTeam;
  statistics?: Array<{
    name?: string;
    displayValue?: string;
    label?: string;
  }>;
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

type EspnSummaryResponse = {
  boxscore?: {
    players?: Array<{
      team?: EspnTeam;
      statistics?: Array<{
        name?: string;
        labels?: string[];
        names?: string[];
        keys?: string[];
        athletes?: Array<{
          active?: boolean;
          starter?: boolean;
          didNotPlay?: boolean;
          ejected?: boolean;
          reason?: string;
          athlete?: {
            id?: string;
            displayName?: string;
            fullName?: string;
            shortName?: string;
            position?: { abbreviation?: string; name?: string };
          };
          stats?: Array<string | number | null>;
        }>;
      }>;
    }>;
  };
};

function readTeamScore(competitor: EspnScoreboardCompetitor) {
  return readNumber(
    typeof competitor.score === "object" && competitor.score !== null
      ? competitor.score.value
      : competitor.score
  );
}

function pickNbaTeamStat(
  competitor: EspnScoreboardCompetitor,
  terms: string[]
): number | null {
  const stats = Array.isArray(competitor.statistics) ? competitor.statistics : [];
  const normalized = terms.map(normalizeToken);
  const match = stats.find((s) => {
    const name = normalizeToken(readString(s.name) ?? "");
    const label = normalizeToken(readString(s.label) ?? "");
    return normalized.some((t) => name.includes(t) || label.includes(t));
  });
  if (!match) return null;
  return readNumber(match.displayValue);
}

function extractNbaTeamStats(competitor: EspnScoreboardCompetitor, opponentScore: number | null): JsonRecord {
  const score = readTeamScore(competitor);
  const rebounds = pickNbaTeamStat(competitor, ["totalrebounds", "rebounds", "reb"]);
  const assists = pickNbaTeamStat(competitor, ["assists", "ast"]);
  const offensiveRebounds = pickNbaTeamStat(competitor, ["offensiverebounds", "oreb"]);
  const defensiveRebounds = pickNbaTeamStat(competitor, ["defensiverebounds", "dreb"]);
  const turnovers = pickNbaTeamStat(competitor, ["turnovers", "to"]);
  const steals = pickNbaTeamStat(competitor, ["steals", "stl"]);
  const blocks = pickNbaTeamStat(competitor, ["blocks", "blk"]);
  const fga = pickNbaTeamStat(competitor, ["fieldgoalsattempted", "fga"]);
  const fgm = pickNbaTeamStat(competitor, ["fieldgoalsmade", "fgm"]);
  const fta = pickNbaTeamStat(competitor, ["freethrowsattempted", "fta"]);
  const ftm = pickNbaTeamStat(competitor, ["freethrowsmade", "ftm"]);
  const threeAttempts = pickNbaTeamStat(competitor, ["threepointfieldgoalsattempted", "3pa"]);
  const threes = pickNbaTeamStat(competitor, ["threepointfieldgoalsmade", "3pm", "fg3m"]);
  const possessions = estimateBasketballPossessions({
    fga,
    fta,
    offensiveRebounds,
    turnovers
  });

  return {
    points: score,
    PTS: score,
    opp_points: opponentScore,
    oppPTS: opponentScore,
    rebounds,
    REB: rebounds,
    offensiveRebounds,
    OREB: offensiveRebounds,
    defensiveRebounds,
    DREB: defensiveRebounds,
    assists,
    AST: assists,
    steals,
    STL: steals,
    blocks,
    BLK: blocks,
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
    threes,
    FG3M: threes,
    threePointAttempts: threeAttempts,
    FG3A: threeAttempts,
    possessions,
    pace: possessions,
    dataQuality: {
      source: "espn_scoreboard",
      hasEstimatedPossessions: possessions !== null,
      statCount: Array.isArray(competitor.statistics) ? competitor.statistics.length : 0
    }
  };
}

function extractNbaPlayerStats(args: {
  labels: string[];
  rawStats: Array<string | number | null>;
  starter: boolean;
  didNotPlay: boolean;
  sourceEventId: string;
}): { stats: JsonRecord; minutes: number | null; outcomeStatus: string } {
  const normalized: JsonRecord = {};
  args.labels.forEach((label, index) => {
    const raw = args.rawStats[index];
    if (!label) return;
    normalized[label] = raw;
    normalized[normalizeToken(label)] = raw;
  });

  const readByLabel = (...labels: string[]) => {
    for (const label of labels) {
      const raw = normalized[label] ?? normalized[normalizeToken(label)];
      const value = readNumber(raw);
      if (typeof value === "number") return value;
    }
    return null;
  };

  const minutes = parseMinutes(normalized.MIN ?? normalized.minutes ?? normalized.min ?? normalized.MP);
  const fg = splitMadeAttempted(normalized.FG ?? normalized.fg);
  const three = splitMadeAttempted(normalized["3PT"] ?? normalized["3pt"] ?? normalized.FG3 ?? normalized.fg3);
  const ft = splitMadeAttempted(normalized.FT ?? normalized.ft);
  const points = readByLabel("PTS", "points", "pts");
  const rebounds = readByLabel("REB", "rebounds", "reb");
  const assists = readByLabel("AST", "assists", "ast");
  const oreb = readByLabel("OREB", "offensiveRebounds", "oreb");
  const dreb = readByLabel("DREB", "defensiveRebounds", "dreb");
  const steals = readByLabel("STL", "steals", "stl");
  const blocks = readByLabel("BLK", "blocks", "blk");
  const turnovers = readByLabel("TO", "turnovers", "to");
  const fouls = readByLabel("PF", "fouls", "personalFouls");
  const plusMinus = readByLabel("+/-", "plusMinus", "plusminus");

  const outcomeStatus = args.didNotPlay
    ? "DNP"
    : minutes !== null && minutes > 0
      ? "PLAYED"
      : "NO_MINUTES";

  return {
    minutes,
    outcomeStatus,
    stats: {
      minutes,
      MIN: minutes,
      points,
      PTS: points,
      rebounds,
      REB: rebounds,
      assists,
      AST: assists,
      threes: three.made,
      FG3M: three.made,
      "3PM": three.made,
      threePointAttempts: three.attempted,
      FG3A: three.attempted,
      fieldGoalsMade: fg.made,
      FGM: fg.made,
      fieldGoalsAttempted: fg.attempted,
      FGA: fg.attempted,
      freeThrowsMade: ft.made,
      FTM: ft.made,
      freeThrowsAttempted: ft.attempted,
      FTA: ft.attempted,
      offensiveRebounds: oreb,
      OREB: oreb,
      defensiveRebounds: dreb,
      DREB: dreb,
      steals,
      STL: steals,
      blocks,
      BLK: blocks,
      turnovers,
      TO: turnovers,
      fouls,
      PF: fouls,
      plusMinus,
      starter: args.starter,
      outcomeStatus,
      dataQuality: {
        source: "espn_summary_boxscore",
        sourceEventId: args.sourceEventId,
        hasMinutes: minutes !== null,
        hasCoreStats: points !== null || rebounds !== null || assists !== null,
        rawLabelCount: args.labels.length
      }
    }
  };
}

async function ingestNbaPlayerBoxscore(args: {
  eventId: string;
  leagueId: string;
  gameId: string;
  teamByEspnId: Map<string, string>;
}): Promise<PlayerIngestCounters> {
  let summary: EspnSummaryResponse;
  try {
    summary = await fetchJson<EspnSummaryResponse>(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${args.eventId}`
    );
  } catch (err) {
    console.error(`[nba-ingest] Summary fetch failed for ${args.eventId}:`, err);
    return { attempted: 0, written: 0, skipped: 0 };
  }

  let attempted = 0;
  let written = 0;
  let skipped = 0;

  for (const teamBlock of summary.boxscore?.players ?? []) {
    const espnTeamId = readString(teamBlock.team?.id);
    const teamId = espnTeamId ? args.teamByEspnId.get(espnTeamId) : null;
    if (!teamId) {
      skipped += 1;
      continue;
    }

    for (const statGroup of teamBlock.statistics ?? []) {
      const labels = statGroup.labels ?? statGroup.names ?? statGroup.keys ?? [];
      if (!labels.length) {
        continue;
      }

      for (const athleteRow of statGroup.athletes ?? []) {
        attempted += 1;
        const athlete = athleteRow.athlete;
        const athleteId = readString(athlete?.id);
        const playerName =
          readString(athlete?.displayName) ??
          readString(athlete?.fullName) ??
          readString(athlete?.shortName);

        if (!athleteId || !playerName) {
          skipped += 1;
          continue;
        }

        const parsed = extractNbaPlayerStats({
          labels,
          rawStats: athleteRow.stats ?? [],
          starter: Boolean(athleteRow.starter),
          didNotPlay: Boolean(athleteRow.didNotPlay),
          sourceEventId: args.eventId
        });

        if (parsed.outcomeStatus === "DNP") {
          skipped += 1;
          continue;
        }

        const player = await findOrCreatePlayer({
          leagueId: args.leagueId,
          teamId,
          name: playerName,
          position: readString(athlete?.position?.abbreviation) ?? readString(athlete?.position?.name) ?? "UNK",
          externalIdKey: "espn",
          externalIdValue: athleteId
        });

        await upsertPlayerGameStat({
          gameId: args.gameId,
          playerId: player.id,
          statsJson: parsed.stats,
          minutes: parsed.minutes,
          starter: Boolean(athleteRow.starter),
          outcomeStatus: parsed.outcomeStatus
        });
        written += 1;
      }
    }
  }

  return { attempted, written, skipped };
}

export async function ingestNbaRecentGames(lookbackDays = 14): Promise<{
  attempted: number;
  ok: number;
  skipped: number;
  errors: number;
  playerStatsWritten: number;
  detail: NbaIngestResult[];
}> {
  const league = await getLeague("NBA");
  if (!league) {
    return { attempted: 0, ok: 0, skipped: 0, errors: 0, playerStatsWritten: 0, detail: [] };
  }

  const detail: NbaIngestResult[] = [];
  let playerStatsWritten = 0;

  const dates: string[] = [];
  for (let d = 0; d < lookbackDays; d++) {
    const date = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
    dates.push(date.toISOString().slice(0, 10).replace(/-/g, ""));
  }

  for (const dateStr of dates) {
    let scoreboard: EspnScoreboardResponse;
    try {
      scoreboard = await fetchJson<EspnScoreboardResponse>(
        `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`
      );
    } catch (err) {
      console.error(`[nba-ingest] Scoreboard fetch failed for ${dateStr}:`, err);
      continue;
    }

    for (const event of scoreboard.events ?? []) {
      const eventId = readString(event.id);
      if (!eventId) continue;

      const competition = event.competitions?.[0];
      const completed = Boolean(competition?.status?.type?.completed);
      if (!completed) continue;

      const competitors = competition?.competitors ?? [];
      const home = competitors.find((c) => String(c.homeAway ?? "").toLowerCase() === "home");
      const away = competitors.find((c) => String(c.homeAway ?? "").toLowerCase() === "away");

      if (!home?.team || !away?.team) {
        detail.push({ eventId, status: "skip", reason: "Missing competitor teams" });
        continue;
      }

      const homeEspnId = readString(home.team.id);
      const awayEspnId = readString(away.team.id);
      if (!homeEspnId || !awayEspnId) {
        detail.push({ eventId, status: "skip", reason: "Missing ESPN team IDs" });
        continue;
      }

      try {
        const [homeTeam, awayTeam] = await Promise.all([
          findOrCreateTeam({
            leagueId: league.id,
            name:
              readString(home.team.displayName ?? home.team.shortDisplayName ?? home.team.name) ??
              `Team ${homeEspnId}`,
            abbreviation: readString(home.team.abbreviation) ?? homeEspnId.slice(0, 3).toUpperCase(),
            externalIdKey: "espn",
            externalIdValue: homeEspnId
          }),
          findOrCreateTeam({
            leagueId: league.id,
            name:
              readString(away.team.displayName ?? away.team.shortDisplayName ?? away.team.name) ??
              `Team ${awayEspnId}`,
            abbreviation: readString(away.team.abbreviation) ?? awayEspnId.slice(0, 3).toUpperCase(),
            externalIdKey: "espn",
            externalIdValue: awayEspnId
          })
        ]);

        const homeScore = readTeamScore(home);
        const awayScore = readTeamScore(away);
        const externalEventId = `espn_nba_${eventId}`;
        const game = await findOrCreateGame({
          leagueId: league.id,
          externalEventId,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          startTime: new Date(readString(event.date) ?? Date.now()),
          venue: readString(competition?.venue?.fullName),
          scoreJson: {
            homeScore,
            awayScore,
            source: "espn_scoreboard"
          }
        });

        const homeStats = extractNbaTeamStats(home, awayScore);
        const awayStats = extractNbaTeamStats(away, homeScore);

        await Promise.all([
          upsertTeamGameStat(game.id, homeTeam.id, homeStats),
          upsertTeamGameStat(game.id, awayTeam.id, awayStats)
        ]);

        const playerCounters = await ingestNbaPlayerBoxscore({
          eventId,
          leagueId: league.id,
          gameId: game.id,
          teamByEspnId: new Map([
            [homeEspnId, homeTeam.id],
            [awayEspnId, awayTeam.id]
          ])
        });
        playerStatsWritten += playerCounters.written;

        const homeName = readString(home.team.displayName ?? home.team.name) ?? "";
        const awayName = readString(away.team.displayName ?? away.team.name) ?? "";
        await Promise.all([
          linkCompetitorToTeam("NBA", homeName, homeTeam.id),
          linkCompetitorToTeam("NBA", awayName, awayTeam.id)
        ]);

        detail.push({
          eventId,
          status: "ok",
          teamStatsWritten: 2,
          playerStatsWritten: playerCounters.written,
          playerStatsSkipped: playerCounters.skipped
        });
      } catch (err) {
        detail.push({
          eventId,
          status: "error",
          reason: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  return {
    attempted: detail.length,
    ok: detail.filter((r) => r.status === "ok").length,
    skipped: detail.filter((r) => r.status === "skip").length,
    errors: detail.filter((r) => r.status === "error").length,
    playerStatsWritten,
    detail
  };
}

// ─── Combined entry point ─────────────────────────────────────────────────────

export async function ingestTeamStats(args: {
  leagues?: ("MLB" | "NBA")[];
  lookbackDays?: number;
}) {
  const leagues = args.leagues ?? ["MLB", "NBA"];
  const days = args.lookbackDays ?? 14;
  const results: Record<string, unknown> = {};

  if (leagues.includes("MLB")) {
    results.mlb = await ingestMlbRecentGames(days);
  }
  if (leagues.includes("NBA")) {
    results.nba = await ingestNbaRecentGames(days);
  }

  return results;
}
