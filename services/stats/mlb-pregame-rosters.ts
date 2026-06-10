import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;
type TeamBlock = { team?: { id?: number; name?: string; abbreviation?: string }; probablePitcher?: { id?: number; fullName?: string } };
type ScheduleGame = { gamePk: number; gameDate: string; status?: { abstractGameState?: string }; teams?: { home?: TeamBlock; away?: TeamBlock } };
type ScheduleResponse = { dates?: Array<{ games?: ScheduleGame[] }> };
type RosterResponse = { roster?: Array<{ person?: { id?: number; fullName?: string }; position?: { abbreviation?: string; code?: string } }> };

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function fmt(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SharkEdge/2.0 mlb-pregame-rosters" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json() as T;
}

async function team(leagueId: string, block: TeamBlock) {
  const id = block.team?.id;
  const name = block.team?.name;
  if (!id || !name) return null;
  const abbr = block.team?.abbreviation ?? name.slice(0, 3).toUpperCase();
  const existing = await prisma.team.findFirst({ where: { leagueId, OR: [{ externalIds: { path: ["mlb"], equals: String(id) } }, { name: { equals: name, mode: "insensitive" } }] } });
  if (existing) return prisma.team.update({ where: { id: existing.id }, data: { abbreviation: abbr, externalIds: toJson({ ...asRecord(existing.externalIds), mlb: String(id) }) }, select: { id: true } });
  return prisma.team.create({ data: { leagueId, key: `${leagueId}:mlb:${id}`, name, abbreviation: abbr, externalIds: toJson({ mlb: String(id) }) }, select: { id: true } });
}

async function game(leagueId: string, row: ScheduleGame, homeTeamId: string, awayTeamId: string) {
  const externalEventId = `mlb_${row.gamePk}`;
  const status = row.status?.abstractGameState?.toLowerCase() === "live" ? "LIVE" : "PREGAME";
  const existing = await prisma.game.findUnique({ where: { externalEventId } });
  const data = { leagueId, externalEventId, startTime: new Date(row.gameDate), homeTeamId, awayTeamId, status: status as "PREGAME" | "LIVE", liveStateJson: toJson({ gamePk: row.gamePk, probablePitchers: { home: row.teams?.home?.probablePitcher ?? null, away: row.teams?.away?.probablePitcher ?? null }, source: "mlb_pregame_rosters" }) };
  if (existing) return prisma.game.update({ where: { id: existing.id }, data, select: { id: true } });
  return prisma.game.create({ data: { ...data, scoreJson: toJson({ gamePk: row.gamePk }) }, select: { id: true } });
}

async function players(leagueId: string, teamId: string, mlbTeamId: number) {
  const body = await fetchJson<RosterResponse>(`https://statsapi.mlb.com/api/v1/teams/${mlbTeamId}/roster?rosterType=active`);
  let count = 0;
  for (const row of body.roster ?? []) {
    const mlbId = row.person?.id;
    const name = row.person?.fullName?.trim();
    if (!mlbId || !name) continue;
    const position = row.position?.abbreviation ?? row.position?.code ?? "UNK";
    const existing = await prisma.player.findFirst({ where: { leagueId, OR: [{ externalIds: { path: ["mlb"], equals: String(mlbId) } }, { teamId, name: { equals: name, mode: "insensitive" } }] } });
    if (existing) await prisma.player.update({ where: { id: existing.id }, data: { teamId, name, position, externalIds: toJson({ ...asRecord(existing.externalIds), mlb: String(mlbId), source: "mlb_active_roster" }) } });
    else await prisma.player.create({ data: { leagueId, teamId, key: `${leagueId}:mlb:${mlbId}`, name, position, externalIds: toJson({ mlb: String(mlbId), source: "mlb_active_roster" }) } });
    count += 1;
  }
  return count;
}

async function teamGameStat(gameId: string, teamId: string, side: "home" | "away", teamBlock: TeamBlock, opponentBlock: TeamBlock, rosterCount: number) {
  const statsJson = { teamSide: side, rosterLoaded: true, activeRosterCount: rosterCount, probablePitcherId: teamBlock.probablePitcher?.id ?? null, probablePitcherName: teamBlock.probablePitcher?.fullName ?? null, opposingProbablePitcherId: opponentBlock.probablePitcher?.id ?? null, opposingProbablePitcherName: opponentBlock.probablePitcher?.fullName ?? null, dataQuality: { source: "mlb_active_roster_pregame", hasRoster: rosterCount > 0, hasProbablePitcher: Boolean(teamBlock.probablePitcher?.id) } };
  await prisma.teamGameStat.upsert({ where: { gameId_teamId: { gameId, teamId } }, update: { statsJson: toJson(statsJson) }, create: { gameId, teamId, statsJson: toJson(statsJson) } });
}

export async function ingestMlbPregameRosters(args: { lookaheadDays?: number } = {}) {
  const league = await prisma.league.findUnique({ where: { key: "MLB" } });
  if (!league) return { ok: false, attemptedGames: 0, gamesUpserted: 0, playersUpserted: 0, error: "MLB league missing" };
  const start = new Date();
  const end = new Date(Date.now() + Math.max(0, Math.min(14, args.lookaheadDays ?? 3)) * 86400000);
  const schedule = await fetchJson<ScheduleResponse>(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${fmt(start)}&endDate=${fmt(end)}&hydrate=probablePitcher,team&gameType=R,P,F,D,L,W`);
  const games = (schedule.dates ?? []).flatMap((day) => day.games ?? []).filter((row) => row.status?.abstractGameState?.toLowerCase() !== "final");
  let gamesUpserted = 0;
  let playersUpserted = 0;
  for (const row of games) {
    const homeBlock = row.teams?.home;
    const awayBlock = row.teams?.away;
    if (!homeBlock?.team?.id || !awayBlock?.team?.id) continue;
    const home = await team(league.id, homeBlock);
    const away = await team(league.id, awayBlock);
    if (!home || !away) continue;
    const dbGame = await game(league.id, row, home.id, away.id);
    const [homeCount, awayCount] = await Promise.all([players(league.id, home.id, homeBlock.team.id), players(league.id, away.id, awayBlock.team.id)]);
    await Promise.all([teamGameStat(dbGame.id, home.id, "home", homeBlock, awayBlock, homeCount), teamGameStat(dbGame.id, away.id, "away", awayBlock, homeBlock, awayCount)]);
    gamesUpserted += 1;
    playersUpserted += homeCount + awayCount;
  }
  return { ok: true, attemptedGames: games.length, gamesUpserted, playersUpserted };
}
