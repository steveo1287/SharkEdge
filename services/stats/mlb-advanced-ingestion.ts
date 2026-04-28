import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";

type JsonRecord = Record<string, unknown>;

type MlbScheduleResponse = {
  dates?: Array<{
    games?: MlbScheduleGame[];
  }>;
};

type MlbScheduleGame = {
  gamePk: number;
  gameDate: string;
  status?: { abstractGameState?: string; detailedState?: string };
  venue?: { id?: number; name?: string };
  weather?: { condition?: string; temp?: string; wind?: string };
  teams?: {
    home?: MlbScheduleTeamBlock;
    away?: MlbScheduleTeamBlock;
  };
};

type MlbScheduleTeamBlock = {
  team?: { id?: number; name?: string; abbreviation?: string };
  score?: number;
  probablePitcher?: { id?: number; fullName?: string; link?: string };
};

type MlbBoxscoreResponse = {
  teams?: {
    home?: MlbBoxscoreTeam;
    away?: MlbBoxscoreTeam;
  };
};

type MlbBoxscoreTeam = {
  team?: { id?: number; name?: string; abbreviation?: string };
  battingOrder?: number[];
  pitchers?: number[];
  players?: Record<string, MlbPlayerBoxscore>;
  teamStats?: {
    batting?: JsonRecord;
    pitching?: JsonRecord;
    fielding?: JsonRecord;
  };
};

type MlbPlayerBoxscore = {
  person?: { id?: number; fullName?: string };
  position?: { abbreviation?: string; code?: string; name?: string };
  stats?: {
    batting?: JsonRecord;
    pitching?: JsonRecord;
    fielding?: JsonRecord;
  };
  gameStatus?: { isCurrentBatter?: boolean; isCurrentPitcher?: boolean };
};

type EnhancedResult = {
  gamePk: number;
  status: "ok" | "skip" | "error";
  reason?: string;
  teamRowsUpdated?: number;
  playerRowsWritten?: number;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const cleaned = value.replace(/[, mphMPH]/g, "").trim();
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseInnings(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;
  const [wholeRaw, thirdsRaw] = value.split(".");
  const whole = Number(wholeRaw);
  if (!Number.isFinite(whole)) return null;
  const thirds = Number(thirdsRaw ?? 0);
  if (!Number.isFinite(thirds)) return whole;
  return whole + Math.min(2, thirds) / 3;
}

function parseWindMph(wind: string | null | undefined) {
  if (!wind) return null;
  const match = wind.match(/(\d+(?:\.\d+)?)\s*mph/i);
  return match ? Number(match[1]) : null;
}

function parseWindDirection(wind: string | null | undefined) {
  if (!wind) return null;
  const lower = wind.toLowerCase();
  if (lower.includes("out")) return "out";
  if (lower.includes("in")) return "in";
  if (lower.includes("left")) return "left";
  if (lower.includes("right")) return "right";
  return "unknown";
}

function weatherRunFactor(weather: MlbScheduleGame["weather"]) {
  const temp = readNumber(weather?.temp);
  const windMph = parseWindMph(weather?.wind);
  const direction = parseWindDirection(weather?.wind);
  let factor = 1;
  if (temp !== null) factor += (temp - 70) * 0.0025;
  if (windMph !== null && direction === "out") factor += Math.min(0.08, windMph * 0.005);
  if (windMph !== null && direction === "in") factor -= Math.min(0.08, windMph * 0.005);
  return Number(Math.min(1.15, Math.max(0.85, factor)).toFixed(4));
}

async function fetchJson<T>(url: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "SharkEdge/2.0 mlb-advanced-ingest" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function getMlbLeague() {
  return prisma.league.findUnique({ where: { key: "MLB" } });
}

async function findOrCreateTeam(args: {
  leagueId: string;
  mlbId: string;
  name: string;
  abbreviation: string;
}) {
  const existing = await prisma.team.findFirst({
    where: {
      leagueId: args.leagueId,
      OR: [
        { externalIds: { path: ["mlb"], equals: args.mlbId } },
        { name: { equals: args.name, mode: "insensitive" } }
      ]
    }
  });

  if (existing) {
    return prisma.team.update({
      where: { id: existing.id },
      data: {
        abbreviation: args.abbreviation,
        externalIds: toJson({ ...((existing.externalIds as JsonRecord | null) ?? {}), mlb: args.mlbId })
      },
      select: { id: true }
    });
  }

  return prisma.team.create({
    data: {
      leagueId: args.leagueId,
      key: `${args.leagueId}:mlb:${args.mlbId}`,
      name: args.name,
      abbreviation: args.abbreviation,
      externalIds: toJson({ mlb: args.mlbId })
    },
    select: { id: true }
  });
}

async function findOrCreatePlayer(args: {
  leagueId: string;
  teamId: string;
  mlbId: string;
  name: string;
  position: string;
}) {
  const existing = await prisma.player.findFirst({
    where: {
      leagueId: args.leagueId,
      OR: [
        { externalIds: { path: ["mlb"], equals: args.mlbId } },
        { teamId: args.teamId, name: { equals: args.name, mode: "insensitive" } }
      ]
    }
  });

  if (existing) {
    return prisma.player.update({
      where: { id: existing.id },
      data: {
        teamId: args.teamId,
        position: args.position,
        externalIds: toJson({ ...((existing.externalIds as JsonRecord | null) ?? {}), mlb: args.mlbId })
      },
      select: { id: true }
    });
  }

  const parts = args.name.split(/\s+/).filter(Boolean);
  return prisma.player.create({
    data: {
      leagueId: args.leagueId,
      teamId: args.teamId,
      key: `${args.leagueId}:mlb:${args.mlbId}`,
      name: args.name,
      firstName: parts[0] ?? null,
      lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
      position: args.position,
      externalIds: toJson({ mlb: args.mlbId })
    },
    select: { id: true }
  });
}

async function findOrCreateGame(args: {
  leagueId: string;
  gamePk: number;
  homeTeamId: string;
  awayTeamId: string;
  startTime: Date;
  venue?: string | null;
  scoreJson: JsonRecord;
}) {
  const externalEventId = `mlb_${args.gamePk}`;
  const existing = await prisma.game.findUnique({ where: { externalEventId } });
  if (existing) {
    return prisma.game.update({
      where: { id: existing.id },
      data: {
        homeTeamId: args.homeTeamId,
        awayTeamId: args.awayTeamId,
        startTime: args.startTime,
        venue: args.venue ?? existing.venue,
        scoreJson: toJson(args.scoreJson),
        liveStateJson: toJson(args.scoreJson),
        status: "FINAL"
      },
      select: { id: true }
    });
  }

  return prisma.game.create({
    data: {
      leagueId: args.leagueId,
      externalEventId,
      homeTeamId: args.homeTeamId,
      awayTeamId: args.awayTeamId,
      startTime: args.startTime,
      venue: args.venue ?? null,
      scoreJson: toJson(args.scoreJson),
      liveStateJson: toJson(args.scoreJson),
      status: "FINAL"
    },
    select: { id: true }
  });
}

function teamBattingStats(team: MlbBoxscoreTeam) {
  return asRecord(team.teamStats?.batting);
}

function teamPitchingStats(team: MlbBoxscoreTeam) {
  return asRecord(team.teamStats?.pitching);
}

function teamFieldingStats(team: MlbBoxscoreTeam) {
  return asRecord(team.teamStats?.fielding);
}

function calcOps(batting: JsonRecord) {
  const obp = readNumber(batting.obp);
  const slg = readNumber(batting.slg);
  return obp !== null && slg !== null ? Number((obp + slg).toFixed(4)) : readNumber(batting.ops);
}

function teamContext(args: {
  side: "home" | "away";
  scheduleGame: MlbScheduleGame;
  boxTeam: MlbBoxscoreTeam;
  oppBoxTeam: MlbBoxscoreTeam;
}) {
  const batting = teamBattingStats(args.boxTeam);
  const pitching = teamPitchingStats(args.boxTeam);
  const fielding = teamFieldingStats(args.boxTeam);
  const oppBatting = teamBattingStats(args.oppBoxTeam);
  const probablePitcher = args.scheduleGame.teams?.[args.side]?.probablePitcher ?? null;
  const oppSide = args.side === "home" ? "away" : "home";
  const oppProbablePitcher = args.scheduleGame.teams?.[oppSide]?.probablePitcher ?? null;
  const weather = args.scheduleGame.weather;
  const hits = readNumber(batting.hits);
  const walks = readNumber(batting.baseOnBalls);
  const totalBases = readNumber(batting.totalBases);
  const atBats = readNumber(batting.atBats);
  const plateAppearances = readNumber(batting.plateAppearances) ?? null;
  const runs = readNumber(batting.runs);
  const oppRuns = readNumber(oppBatting.runs);
  const inningsPitched = parseInnings(pitching.inningsPitched);
  const pitchesThrown = readNumber(pitching.pitchesThrown);
  const bullpenInnings = inningsPitched !== null ? Math.max(0, inningsPitched - 5) : null;
  const pitchingStrikeouts = readNumber(pitching.strikeOuts);
  const pitchingWalks = readNumber(pitching.baseOnBalls);
  const earnedRuns = readNumber(pitching.earnedRuns);
  const defensiveErrors = readNumber(fielding.errors);
  const ops = calcOps(batting);
  const avg = readNumber(batting.avg);
  const obp = readNumber(batting.obp);
  const slg = readNumber(batting.slg);
  const iso = slg !== null && avg !== null ? Number((slg - avg).toFixed(4)) : null;
  const strikeoutRate = plateAppearances !== null && plateAppearances > 0 ? readNumber(batting.strikeOuts)! / plateAppearances : null;
  const walkRate = plateAppearances !== null && plateAppearances > 0 ? readNumber(batting.baseOnBalls)! / plateAppearances : null;
  const whip = inningsPitched !== null && inningsPitched > 0
    ? ((readNumber(pitching.hits) ?? 0) + (readNumber(pitching.baseOnBalls) ?? 0)) / inningsPitched
    : null;
  const kMinusBb = inningsPitched !== null && inningsPitched > 0
    ? ((pitchingStrikeouts ?? 0) - (pitchingWalks ?? 0)) / inningsPitched
    : null;
  const eraProxy = inningsPitched !== null && inningsPitched > 0 && earnedRuns !== null ? earnedRuns * 9 / inningsPitched : null;
  const defensiveEfficiency = defensiveErrors !== null ? Math.max(0, 1 - defensiveErrors * 0.07) : null;

  return {
    points: runs,
    runs,
    R: runs,
    opp_points: oppRuns,
    runs_allowed: oppRuns,
    RA: oppRuns,
    hits,
    H: hits,
    walks: readNumber(batting.baseOnBalls),
    strikeouts: readNumber(batting.strikeOuts),
    homeRuns: readNumber(batting.homeRuns),
    HR: readNumber(batting.homeRuns),
    totalBases,
    atBats,
    plateAppearances,
    avg,
    obp,
    slg,
    ops,
    iso,
    strikeoutRate,
    walkRate,
    inningsPitched,
    pitchCount: pitchesThrown,
    pitchesThrown,
    bullpenInningsLast3: bullpenInnings,
    bullpenPitchesLast3: pitchesThrown !== null && inningsPitched !== null ? Math.max(0, pitchesThrown - 78) : null,
    pitcherStrikeouts: pitchingStrikeouts,
    pitcherWalks: pitchingWalks,
    hitsAllowed: readNumber(pitching.hits),
    earnedRuns,
    whip,
    kMinusBb,
    eraProxy,
    defensiveErrors,
    defensiveEfficiency,
    def_eff: defensiveEfficiency,
    probablePitcherId: probablePitcher?.id ?? null,
    probablePitcherName: probablePitcher?.fullName ?? null,
    opposingProbablePitcherId: oppProbablePitcher?.id ?? null,
    opposingProbablePitcherName: oppProbablePitcher?.fullName ?? null,
    starterStrength: kMinusBb !== null ? Number(Math.max(0, Math.min(160, 100 + kMinusBb * 18)).toFixed(3)) : null,
    bullpenStrength: whip !== null ? Number(Math.max(40, Math.min(150, 115 - (whip - 1.25) * 42)).toFixed(3)) : null,
    reliefPitchingScore: whip !== null ? Number(Math.max(40, Math.min(150, 115 - (whip - 1.25) * 42)).toFixed(3)) : null,
    parkFactor: 1,
    park_factor: 1,
    venueId: args.scheduleGame.venue?.id ?? null,
    venue: args.scheduleGame.venue?.name ?? null,
    weatherRunFactor: weatherRunFactor(weather),
    weatherWindFactor: weatherRunFactor(weather),
    weather: {
      condition: weather?.condition ?? null,
      temp: readNumber(weather?.temp),
      wind: weather?.wind ?? null,
      windMph: parseWindMph(weather?.wind),
      windDirection: parseWindDirection(weather?.wind)
    },
    travelRestScore: null,
    daysRest: null,
    dataQuality: {
      source: "mlb_statsapi_advanced_enhancer",
      hasProbablePitcher: Boolean(probablePitcher?.id),
      hasWeather: Boolean(weather?.condition || weather?.temp || weather?.wind),
      hasPitchingContext: inningsPitched !== null,
      hasOffenseContext: hits !== null || ops !== null
    }
  };
}

function playerStats(args: {
  player: MlbPlayerBoxscore;
  gamePk: number;
  teamSide: "home" | "away";
  battingOrder: Set<number>;
  pitcherIds: Set<number>;
}) {
  const batting = asRecord(args.player.stats?.batting);
  const pitching = asRecord(args.player.stats?.pitching);
  const fielding = asRecord(args.player.stats?.fielding);
  const playerId = args.player.person?.id ?? null;
  const isPitcher = playerId !== null && args.pitcherIds.has(playerId);
  const innings = parseInnings(pitching.inningsPitched);
  const plateAppearances = readNumber(batting.plateAppearances);
  const hits = readNumber(batting.hits);
  const walks = readNumber(batting.baseOnBalls);
  const strikeouts = readNumber(batting.strikeOuts);
  const atBats = readNumber(batting.atBats);
  const slg = readNumber(batting.slg);
  const avg = readNumber(batting.avg);
  const obp = readNumber(batting.obp);
  const ops = obp !== null && slg !== null ? Number((obp + slg).toFixed(4)) : readNumber(batting.ops);
  const iso = slg !== null && avg !== null ? Number((slg - avg).toFixed(4)) : null;
  const outsPitched = innings !== null ? Math.round(innings * 3) : null;
  const starter = Boolean(playerId !== null && args.pitcherIds.values().next().value === playerId);

  return {
    teamSide: args.teamSide,
    position: args.player.position?.abbreviation ?? args.player.position?.code ?? "UNK",
    battingOrder: playerId !== null && args.battingOrder.has(playerId),
    starter,
    atBats,
    plateAppearances,
    hits,
    runs: readNumber(batting.runs),
    rbi: readNumber(batting.rbi),
    homeRuns: readNumber(batting.homeRuns),
    walks,
    strikeouts,
    avg,
    obp,
    slg,
    ops,
    iso,
    stolenBases: readNumber(batting.stolenBases),
    inningsPitched: innings,
    pitcherOuts: outsPitched,
    outsPitched,
    recorded_outs: outsPitched,
    pitchingStrikeouts: readNumber(pitching.strikeOuts),
    strikeoutsPitching: readNumber(pitching.strikeOuts),
    SO: readNumber(pitching.strikeOuts),
    hitsAllowed: readNumber(pitching.hits),
    earnedRuns: readNumber(pitching.earnedRuns),
    walksAllowed: readNumber(pitching.baseOnBalls),
    homeRunsAllowed: readNumber(pitching.homeRuns),
    pitchesThrown: readNumber(pitching.pitchesThrown),
    errors: readNumber(fielding.errors),
    isPitcher,
    dataQuality: {
      source: "mlb_statsapi_boxscore_players",
      sourceGamePk: args.gamePk,
      hasBatting: Object.keys(batting).length > 0,
      hasPitching: Object.keys(pitching).length > 0
    }
  };
}

async function upsertPlayerRow(args: {
  leagueId: string;
  teamId: string;
  gameId: string;
  gamePk: number;
  teamSide: "home" | "away";
  player: MlbPlayerBoxscore;
  battingOrder: Set<number>;
  pitcherIds: Set<number>;
}) {
  const mlbId = args.player.person?.id;
  const name = readString(args.player.person?.fullName);
  if (!mlbId || !name) return false;
  const stats = playerStats({
    player: args.player,
    gamePk: args.gamePk,
    teamSide: args.teamSide,
    battingOrder: args.battingOrder,
    pitcherIds: args.pitcherIds
  });
  const hasRealStats = Boolean(stats.plateAppearances || stats.inningsPitched || stats.pitchesThrown || stats.atBats);
  if (!hasRealStats) return false;
  const player = await findOrCreatePlayer({
    leagueId: args.leagueId,
    teamId: args.teamId,
    mlbId: String(mlbId),
    name,
    position: stats.position
  });
  await prisma.playerGameStat.upsert({
    where: { gameId_playerId: { gameId: args.gameId, playerId: player.id } },
    update: {
      statsJson: toJson(stats),
      minutes: stats.inningsPitched ?? null,
      starter: Boolean(stats.starter || stats.battingOrder),
      outcomeStatus: "PLAYED"
    },
    create: {
      gameId: args.gameId,
      playerId: player.id,
      statsJson: toJson(stats),
      minutes: stats.inningsPitched ?? null,
      starter: Boolean(stats.starter || stats.battingOrder),
      outcomeStatus: "PLAYED"
    }
  });
  return true;
}

async function enhanceOneGame(args: { leagueId: string; game: MlbScheduleGame }): Promise<EnhancedResult> {
  const gamePk = args.game.gamePk;
  const home = args.game.teams?.home?.team;
  const away = args.game.teams?.away?.team;
  if (!home?.id || !away?.id || !home.name || !away.name) {
    return { gamePk, status: "skip", reason: "Missing schedule team ids" };
  }

  let boxscore: MlbBoxscoreResponse;
  try {
    boxscore = await fetchJson<MlbBoxscoreResponse>(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
  } catch (error) {
    return { gamePk, status: "error", reason: error instanceof Error ? error.message : String(error) };
  }

  const homeBox = boxscore.teams?.home;
  const awayBox = boxscore.teams?.away;
  if (!homeBox || !awayBox) return { gamePk, status: "skip", reason: "Missing boxscore teams" };

  const [homeTeam, awayTeam] = await Promise.all([
    findOrCreateTeam({ leagueId: args.leagueId, mlbId: String(home.id), name: home.name, abbreviation: home.abbreviation ?? home.name.slice(0, 3).toUpperCase() }),
    findOrCreateTeam({ leagueId: args.leagueId, mlbId: String(away.id), name: away.name, abbreviation: away.abbreviation ?? away.name.slice(0, 3).toUpperCase() })
  ]);

  const game = await findOrCreateGame({
    leagueId: args.leagueId,
    gamePk,
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    startTime: new Date(args.game.gameDate),
    venue: args.game.venue?.name ?? null,
    scoreJson: {
      gamePk,
      homeScore: args.game.teams?.home?.score ?? null,
      awayScore: args.game.teams?.away?.score ?? null,
      venue: args.game.venue ?? null,
      probablePitchers: {
        home: args.game.teams?.home?.probablePitcher ?? null,
        away: args.game.teams?.away?.probablePitcher ?? null
      },
      weather: args.game.weather ?? null,
      source: "mlb_statsapi_schedule_hydrate"
    }
  });

  const homeContext = teamContext({ side: "home", scheduleGame: args.game, boxTeam: homeBox, oppBoxTeam: awayBox });
  const awayContext = teamContext({ side: "away", scheduleGame: args.game, boxTeam: awayBox, oppBoxTeam: homeBox });

  await Promise.all([
    prisma.teamGameStat.upsert({
      where: { gameId_teamId: { gameId: game.id, teamId: homeTeam.id } },
      update: { statsJson: toJson(homeContext) },
      create: { gameId: game.id, teamId: homeTeam.id, statsJson: toJson(homeContext) }
    }),
    prisma.teamGameStat.upsert({
      where: { gameId_teamId: { gameId: game.id, teamId: awayTeam.id } },
      update: { statsJson: toJson(awayContext) },
      create: { gameId: game.id, teamId: awayTeam.id, statsJson: toJson(awayContext) }
    })
  ]);

  const homePitcherIds = new Set((homeBox.pitchers ?? []).filter((id): id is number => typeof id === "number"));
  const awayPitcherIds = new Set((awayBox.pitchers ?? []).filter((id): id is number => typeof id === "number"));
  const homeBattingOrder = new Set((homeBox.battingOrder ?? []).filter((id): id is number => typeof id === "number"));
  const awayBattingOrder = new Set((awayBox.battingOrder ?? []).filter((id): id is number => typeof id === "number"));
  let playerRowsWritten = 0;

  for (const player of Object.values(homeBox.players ?? {})) {
    const written = await upsertPlayerRow({
      leagueId: args.leagueId,
      teamId: homeTeam.id,
      gameId: game.id,
      gamePk,
      teamSide: "home",
      player,
      battingOrder: homeBattingOrder,
      pitcherIds: homePitcherIds
    });
    if (written) playerRowsWritten += 1;
  }
  for (const player of Object.values(awayBox.players ?? {})) {
    const written = await upsertPlayerRow({
      leagueId: args.leagueId,
      teamId: awayTeam.id,
      gameId: game.id,
      gamePk,
      teamSide: "away",
      player,
      battingOrder: awayBattingOrder,
      pitcherIds: awayPitcherIds
    });
    if (written) playerRowsWritten += 1;
  }

  return { gamePk, status: "ok", teamRowsUpdated: 2, playerRowsWritten };
}

export async function ingestMlbAdvancedStats(args: { lookbackDays?: number } = {}) {
  const league = await getMlbLeague();
  if (!league) return { attempted: 0, ok: 0, skipped: 0, errors: 0, playerRowsWritten: 0, detail: [] as EnhancedResult[] };
  const lookbackDays = Math.max(1, Math.min(60, args.lookbackDays ?? 14));
  const end = new Date();
  const start = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);
  const fmt = (date: Date) => date.toISOString().slice(0, 10);
  const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${fmt(start)}&endDate=${fmt(end)}&hydrate=probablePitcher,team,venue,weather&gameType=R,P,F,D,L,W`;
  const schedule = await fetchJson<MlbScheduleResponse>(url);
  const games = (schedule.dates ?? [])
    .flatMap((date) => date.games ?? [])
    .filter((game) => game.status?.abstractGameState?.toLowerCase() === "final");

  const detail: EnhancedResult[] = [];
  for (const game of games) {
    detail.push(await enhanceOneGame({ leagueId: league.id, game }));
  }

  return {
    attempted: detail.length,
    ok: detail.filter((row) => row.status === "ok").length,
    skipped: detail.filter((row) => row.status === "skip").length,
    errors: detail.filter((row) => row.status === "error").length,
    playerRowsWritten: detail.reduce((sum, row) => sum + (row.playerRowsWritten ?? 0), 0),
    detail
  };
}
