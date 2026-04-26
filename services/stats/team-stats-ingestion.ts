/**
 * Team Stats Ingestion
 *
 * Fetches completed game boxscores from free public APIs and writes
 * TeamGameStat records. These records are the raw material the Monte Carlo
 * simulation engine reads to derive per-team offensive/defensive context.
 *
 * MLB  → statsapi.mlb.com (official, no auth required)
 * NBA  → site.api.espn.com (public ESPN endpoint)
 *
 * Data flow:
 *   1. Find completed games from the provider schedule
 *   2. Find or create Team records (keyed by leagueId + externalId)
 *   3. Find or create Game records (keyed by externalEventId)
 *   4. Upsert TeamGameStat with the exact stat keys buildOffenseContext() reads
 *   5. Link any existing Competitor records to their Team records
 */

import { prisma } from "@/lib/db/prisma";

import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
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

// ─── League / Team helpers ───────────────────────────────────────────────────

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
    if (existing.key !== teamKey) {
      await prisma.team.update({
        where: { id: existing.id },
        data: {
          externalIds: toJson({
            ...(existing.externalIds as JsonRecord),
            [externalIdKey]: externalIdValue
          })
        }
      });
    }
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

async function findOrCreateGame(args: {
  leagueId: string;
  externalEventId: string;
  homeTeamId: string;
  awayTeamId: string;
  startTime: Date;
  venue?: string | null;
}): Promise<{ id: string }> {
  const existing = await prisma.game.findUnique({
    where: { externalEventId: args.externalEventId }
  });
  if (existing) return { id: existing.id };

  return prisma.game.create({
    data: {
      leagueId: args.leagueId,
      externalEventId: args.externalEventId,
      homeTeamId: args.homeTeamId,
      awayTeamId: args.awayTeamId,
      startTime: args.startTime,
      status: "FINAL",
      venue: args.venue ?? null
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
    hits: readNumber(batting.hits),
    doubles: readNumber(batting.doubles),
    triples: readNumber(batting.triples),
    homeRuns: readNumber(batting.homeRuns),
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
    errors: readNumber(fielding.errors)
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

  const homeStats = extractMlbTeamStats(homeRaw);
  const awayStats = extractMlbTeamStats(awayRaw);

  await Promise.all([
    upsertTeamGameStat(game.id, homeTeam.id, homeStats),
    upsertTeamGameStat(game.id, awayTeam.id, awayStats)
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
};

type EspnScoreboardResponse = {
  events?: Array<{
    id?: string;
    date?: string;
    competitions?: Array<{
      status?: { type?: { completed?: boolean; state?: string } };
      venue?: { fullName?: string };
      competitors?: Array<{
        id?: string;
        homeAway?: string;
        score?: { value?: number } | string | number;
        team?: {
          id?: string;
          displayName?: string;
          shortDisplayName?: string;
          name?: string;
          abbreviation?: string;
        };
        statistics?: Array<{
          name?: string;
          displayValue?: string;
          label?: string;
        }>;
      }>;
    }>;
  }>;
};

function extractNbaTeamStats(
  competitor: NonNullable<
    NonNullable<
      NonNullable<EspnScoreboardResponse["events"]>[number]["competitions"]
    >[number]["competitors"]
  >[number],
  opponentScore: number | null
): JsonRecord {
  const stats = Array.isArray(competitor.statistics) ? competitor.statistics : [];

  function pickStat(terms: string[]): number | null {
    const normalized = terms.map(normalizeToken);
    const match = stats.find((s) => {
      const name = normalizeToken(readString(s.name) ?? "");
      const label = normalizeToken(readString(s.label) ?? "");
      return normalized.some((t) => name.includes(t) || label.includes(t));
    });
    if (!match) return null;
    return readNumber(match.displayValue);
  }

  const points = pickStat(["points", "pts"]);
  const rebounds = pickStat(["totalrebounds", "rebounds", "reb"]);
  const assists = pickStat(["assists", "ast"]);
  const fgPct = pickStat(["fieldgoalpct", "fgpct"]);
  const threePct = pickStat(["threepointpct", "3ppct"]);
  const turnovers = pickStat(["turnovers"]);

  return {
    points,
    opp_points: opponentScore,
    rebounds,
    assists,
    fg_pct: fgPct,
    three_pct: threePct,
    turnovers,
    pace: null
  };
}

export async function ingestNbaRecentGames(lookbackDays = 14): Promise<{
  attempted: number;
  ok: number;
  skipped: number;
  errors: number;
  detail: NbaIngestResult[];
}> {
  const league = await getLeague("NBA");
  if (!league) {
    return { attempted: 0, ok: 0, skipped: 0, errors: 0, detail: [] };
  }

  const detail: NbaIngestResult[] = [];

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

        const externalEventId = `espn_nba_${eventId}`;
        const game = await findOrCreateGame({
          leagueId: league.id,
          externalEventId,
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          startTime: new Date(readString(event.date) ?? Date.now()),
          venue: readString(competition?.venue?.fullName)
        });

        const homeScore = readNumber(
          typeof home.score === "object" && home.score !== null
            ? (home.score as { value?: number }).value
            : home.score
        );
        const awayScore = readNumber(
          typeof away.score === "object" && away.score !== null
            ? (away.score as { value?: number }).value
            : away.score
        );

        const homeStats = extractNbaTeamStats(home, awayScore);
        const awayStats = extractNbaTeamStats(away, homeScore);

        if (homeScore !== null) homeStats.points = homeScore;
        if (awayScore !== null) awayStats.points = awayScore;

        await Promise.all([
          upsertTeamGameStat(game.id, homeTeam.id, homeStats),
          upsertTeamGameStat(game.id, awayTeam.id, awayStats)
        ]);

        const homeName = readString(home.team.displayName ?? home.team.name) ?? "";
        const awayName = readString(away.team.displayName ?? away.team.name) ?? "";
        await Promise.all([
          linkCompetitorToTeam("NBA", homeName, homeTeam.id),
          linkCompetitorToTeam("NBA", awayName, awayTeam.id)
        ]);

        detail.push({ eventId, status: "ok" });
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
