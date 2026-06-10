import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type StatsApiSplits = { stats?: Array<{ splits?: Array<{ stat?: JsonRecord }> }> };

type ContextResult = {
  ok: boolean;
  gamesScanned: number;
  playersScanned: number;
  contextsUpserted: number;
  missingMlbIds: number;
  errors: string[];
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function num(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mlbId(value: unknown) {
  const external = asRecord(value);
  const id = external.mlb;
  if (typeof id === "string" && id.trim()) return id.trim();
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  return null;
}

function parseIp(value: unknown) {
  const raw = num(value);
  if (raw == null) return null;
  const whole = Math.trunc(raw);
  const tenths = Math.round((raw - whole) * 10);
  if (tenths === 1) return whole + 1 / 3;
  if (tenths === 2) return whole + 2 / 3;
  return raw;
}

function rate(numerator: number | null, denominator: number | null) {
  if (numerator == null || denominator == null || denominator <= 0) return null;
  return numerator / denominator;
}

function perGame(total: number | null, games: number | null) {
  return rate(total, games);
}

function slugStats(stat: JsonRecord, group: "hitting" | "pitching") {
  if (group === "hitting") {
    const games = num(stat.gamesPlayed);
    const plateAppearances = num(stat.plateAppearances);
    const atBats = num(stat.atBats);
    const hits = num(stat.hits);
    const doubles = num(stat.doubles);
    const triples = num(stat.triples);
    const homeRuns = num(stat.homeRuns);
    const walks = num(stat.baseOnBalls);
    const strikeouts = num(stat.strikeOuts);
    const totalBases = num(stat.totalBases) ?? ((hits ?? 0) + (doubles ?? 0) + (triples ?? 0) * 2 + (homeRuns ?? 0) * 3);
    const runs = num(stat.runs);
    const rbi = num(stat.rbi);
    const stolenBases = num(stat.stolenBases);
    return {
      group,
      games,
      plateAppearances,
      atBats,
      hits,
      totalBases,
      homeRuns,
      runs,
      rbi,
      walks,
      strikeouts,
      stolenBases,
      avg: num(stat.avg),
      obp: num(stat.obp),
      slg: num(stat.slg),
      ops: num(stat.ops),
      plateAppearancesPerGame: perGame(plateAppearances, games),
      expectedPlateAppearances: plateAppearances == null ? null : Math.max(2.8, Math.min(4.8, plateAppearances / Math.max(1, games ?? 1))),
      expectedHits: perGame(hits, games),
      expectedTotalBases: perGame(totalBases, games),
      expectedHomeRuns: perGame(homeRuns, games),
      expectedRuns: perGame(runs, games),
      expectedRbi: perGame(rbi, games),
      expectedStrikeouts: perGame(strikeouts, games),
      expectedWalks: perGame(walks, games),
      stolenBaseChance: Math.max(0.01, Math.min(0.45, perGame(stolenBases, games) ?? 0.03)),
      batterKRate: rate(strikeouts, plateAppearances),
      batterWalkRate: rate(walks, plateAppearances),
      iso: atBats && atBats > 0 ? ((totalBases ?? 0) - (hits ?? 0)) / atBats : null
    };
  }

  const games = num(stat.gamesPlayed);
  const gamesStarted = num(stat.gamesStarted);
  const inningsPitched = parseIp(stat.inningsPitched);
  const strikeouts = num(stat.strikeOuts);
  const walks = num(stat.baseOnBalls);
  const hitsAllowed = num(stat.hits);
  const earnedRuns = num(stat.earnedRuns);
  const homeRunsAllowed = num(stat.homeRuns);
  const battersFaced = num(stat.battersFaced);
  const starts = Math.max(1, gamesStarted ?? 0);
  const role = (gamesStarted ?? 0) >= Math.max(2, (games ?? 0) * 0.35) ? "starter" : "reliever";
  return {
    group,
    games,
    gamesStarted,
    role,
    inningsPitched,
    strikeouts,
    walks,
    hitsAllowed,
    earnedRuns,
    homeRunsAllowed,
    battersFaced,
    era: num(stat.era),
    whip: num(stat.whip),
    strikeoutsPer9: num(stat.strikeoutsPer9Inn),
    walksPer9: num(stat.walksPer9Inn),
    expectedInningsPitched: inningsPitched == null ? null : Math.max(0.7, Math.min(role === "starter" ? 7.2 : 2.2, inningsPitched / starts)),
    expectedOuts: inningsPitched == null ? null : Math.round(Math.max(0.7, Math.min(role === "starter" ? 7.2 : 2.2, inningsPitched / starts)) * 3),
    expectedStrikeouts: strikeouts == null ? null : strikeouts / starts,
    expectedWalksAllowed: walks == null ? null : walks / starts,
    expectedHitsAllowed: hitsAllowed == null ? null : hitsAllowed / starts,
    expectedEarnedRuns: earnedRuns == null ? null : earnedRuns / starts,
    expectedHomeRunsAllowed: homeRunsAllowed == null ? null : homeRunsAllowed / starts,
    pitcherKRate: rate(strikeouts, battersFaced),
    pitcherWalkRate: rate(walks, battersFaced)
  };
}

async function fetchStats(mlbPlayerId: string, group: "hitting" | "pitching", season: number) {
  const url = `https://statsapi.mlb.com/api/v1/people/${encodeURIComponent(mlbPlayerId)}/stats?stats=season&group=${group}&season=${season}`;
  const response = await fetch(url, { cache: "no-store", headers: { "User-Agent": "SharkEdge/2.0 mlb-player-context" } });
  if (!response.ok) return null;
  const body = await response.json() as StatsApiSplits;
  const stat = body.stats?.[0]?.splits?.[0]?.stat;
  return stat ? slugStats(stat, group) : null;
}

function projectionPayload(args: {
  player: { id: string; name: string; position: string; externalIds: unknown };
  teamName: string;
  gameId: string;
  hitting: ReturnType<typeof slugStats> | null;
  pitching: ReturnType<typeof slugStats> | null;
  season: number;
}) {
  const isPitcher = args.player.position.toUpperCase() === "P" || Boolean(args.pitching?.group === "pitching" && args.pitching.games != null);
  const primary = isPitcher ? args.pitching : args.hitting;
  return {
    source: "mlb_statsapi_player_context",
    season: args.season,
    playerName: args.player.name,
    teamName: args.teamName,
    mlbPlayerId: mlbId(args.player.externalIds),
    position: args.player.position,
    isPitcher,
    statsApi: { hitting: args.hitting, pitching: args.pitching },
    contextQuality: {
      hasHitting: Boolean(args.hitting),
      hasPitching: Boolean(args.pitching),
      games: primary?.games ?? null,
      role: args.pitching?.role ?? (isPitcher ? "pitcher" : "hitter")
    },
    plateAppearances: args.hitting?.expectedPlateAppearances ?? null,
    expectedPlateAppearances: args.hitting?.expectedPlateAppearances ?? null,
    hits: args.hitting?.expectedHits ?? null,
    expectedHits: args.hitting?.expectedHits ?? null,
    totalBases: args.hitting?.expectedTotalBases ?? null,
    expectedTotalBases: args.hitting?.expectedTotalBases ?? null,
    homeRuns: args.hitting?.expectedHomeRuns ?? null,
    expectedHomeRuns: args.hitting?.expectedHomeRuns ?? null,
    runs: args.hitting?.expectedRuns ?? null,
    expectedRuns: args.hitting?.expectedRuns ?? null,
    rbi: args.hitting?.expectedRbi ?? null,
    expectedRbi: args.hitting?.expectedRbi ?? null,
    strikeouts: isPitcher ? args.pitching?.expectedStrikeouts ?? null : args.hitting?.expectedStrikeouts ?? null,
    expectedStrikeouts: isPitcher ? args.pitching?.expectedStrikeouts ?? null : args.hitting?.expectedStrikeouts ?? null,
    stolenBaseChance: args.hitting?.stolenBaseChance ?? null,
    inningsPitched: args.pitching?.expectedInningsPitched ?? null,
    expectedInningsPitched: args.pitching?.expectedInningsPitched ?? null,
    outs: args.pitching?.expectedOuts ?? null,
    expectedOuts: args.pitching?.expectedOuts ?? null,
    earnedRuns: args.pitching?.expectedEarnedRuns ?? null,
    expectedEarnedRuns: args.pitching?.expectedEarnedRuns ?? null,
    hitsAllowed: args.pitching?.expectedHitsAllowed ?? null,
    expectedHitsAllowed: args.pitching?.expectedHitsAllowed ?? null,
    walks: isPitcher ? args.pitching?.expectedWalksAllowed ?? null : args.hitting?.expectedWalks ?? null,
    expectedWalksAllowed: args.pitching?.expectedWalksAllowed ?? null,
    homeRunsAllowed: args.pitching?.expectedHomeRunsAllowed ?? null,
    expectedHomeRunsAllowed: args.pitching?.expectedHomeRunsAllowed ?? null,
    updatedAt: new Date().toISOString()
  };
}

export async function ingestMlbPlayerContext(args: { lookaheadDays?: number; maxPlayers?: number } = {}): Promise<ContextResult> {
  const result: ContextResult = { ok: false, gamesScanned: 0, playersScanned: 0, contextsUpserted: 0, missingMlbIds: 0, errors: [] };
  const league = await prisma.league.findUnique({ where: { key: "MLB" } });
  if (!league) {
    result.errors.push("MLB league missing");
    return result;
  }
  const now = new Date();
  const end = new Date(Date.now() + Math.max(0, Math.min(14, args.lookaheadDays ?? 3)) * 86400000);
  const season = now.getUTCFullYear();
  const games = await prisma.game.findMany({
    where: { leagueId: league.id, status: { in: ["PREGAME", "LIVE"] }, startTime: { gte: new Date(now.getTime() - 3 * 3600000), lte: end } },
    include: { homeTeam: { include: { players: true } }, awayTeam: { include: { players: true } } },
    orderBy: { startTime: "asc" },
    take: 40
  });
  result.gamesScanned = games.length;
  const seen = new Set<string>();
  const limit = Math.max(1, Math.min(900, args.maxPlayers ?? 500));

  for (const game of games) {
    const players = [
      ...game.awayTeam.players.map((player) => ({ player, teamName: game.awayTeam.name })),
      ...game.homeTeam.players.map((player) => ({ player, teamName: game.homeTeam.name }))
    ];
    for (const { player, teamName } of players) {
      if (result.playersScanned >= limit) break;
      const dedupeKey = `${game.id}:${player.id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      result.playersScanned += 1;
      const id = mlbId(player.externalIds);
      if (!id) {
        result.missingMlbIds += 1;
        continue;
      }
      try {
        const [hitting, pitching] = await Promise.all([fetchStats(id, "hitting", season), fetchStats(id, "pitching", season)]);
        const payload = projectionPayload({ player, teamName, gameId: game.id, hitting, pitching, season });
        const starter = Boolean(payload.isPitcher && payload.statsApi.pitching?.role === "starter");
        await prisma.playerGameStat.upsert({
          where: { gameId_playerId: { gameId: game.id, playerId: player.id } },
          update: { statsJson: toJson(payload), starter, outcomeStatus: "PREGAME_CONTEXT" },
          create: { gameId: game.id, playerId: player.id, statsJson: toJson(payload), starter, outcomeStatus: "PREGAME_CONTEXT" }
        });
        result.contextsUpserted += 1;
      } catch (error) {
        result.errors.push(`${player.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  result.ok = result.errors.length === 0 || result.contextsUpserted > 0;
  return result;
}
