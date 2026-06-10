import { prisma } from "@/lib/db/prisma";
import { cacheAgeLabel, readCachedMlbGameDetail } from "@/services/simulation/mlb-game-detail-cache";
import { buildMlbProbablePitcherStatProjections } from "@/services/simulation/mlb-probable-pitcher-stat-projection";

type CachedDetail = NonNullable<Awaited<ReturnType<typeof readCachedMlbGameDetail>>>;
type Projection = CachedDetail["row"]["projection"];
type Edge = CachedDetail["edge"];

type JsonRecord = Record<string, unknown>;

export type FranchiseTeamSide = "away" | "home";

export type FranchiseTeamSummary = {
  side: FranchiseTeamSide;
  name: string;
  teamId: string | null;
  abbreviation: string | null;
  projectedRuns: number | null;
  winPct: number | null;
  f5Runs: number | null;
  actual: TeamActualLine | null;
  starter: PitcherProjection | null;
};

export type TeamActualLine = {
  runs: number | null;
  hits: number | null;
  homeRuns: number | null;
  walks: number | null;
  strikeouts: number | null;
  f5Runs: number | null;
};

export type HitterProjection = {
  playerId: string;
  name: string;
  team: string;
  teamSide: FranchiseTeamSide;
  battingOrder: number | null;
  plateAppearances: number | null;
  hits: number | null;
  totalBases: number | null;
  homeRuns: number | null;
  runs: number | null;
  rbi: number | null;
  strikeouts: number | null;
  stolenBaseChance: number | null;
  actual: PlayerActualLine | null;
};

export type PitcherProjection = {
  playerId: string | null;
  name: string;
  team: string;
  teamSide: FranchiseTeamSide;
  innings: number | null;
  outs: number | null;
  strikeouts: number | null;
  earnedRuns: number | null;
  hitsAllowed: number | null;
  walks: number | null;
  homeRuns: number | null;
  actual: PlayerActualLine | null;
};

export type PlayerActualLine = {
  plateAppearances: number | null;
  hits: number | null;
  totalBases: number | null;
  homeRuns: number | null;
  runs: number | null;
  rbi: number | null;
  strikeouts: number | null;
  stolenBases: number | null;
  inningsPitched: number | null;
  outs: number | null;
  earnedRuns: number | null;
  hitsAllowed: number | null;
  walks: number | null;
};

export type NrfiF5View = {
  nrfiPct: number | null;
  yrfiPct: number | null;
  f5Total: number | null;
  f5AwayRuns: number | null;
  f5HomeRuns: number | null;
  f5Over45Pct: number | null;
  f5AwayWinPct: number | null;
  f5HomeWinPct: number | null;
  f5TiePct: number | null;
  innings: Array<{ inning: number; awayRuns: number; homeRuns: number; totalRuns: number; noRunPct: number }>;
};

export type MlbFranchiseGameCenter = {
  gameId: string;
  game: CachedDetail["row"]["game"];
  projection: Projection;
  edge: Edge;
  cacheLabel: string;
  stale: boolean;
  teams: { away: FranchiseTeamSummary; home: FranchiseTeamSummary };
  lineScore: {
    away: { name: string; runs: number | null; innings: number[]; hits: number | null; errors: number | null };
    home: { name: string; runs: number | null; innings: number[]; hits: number | null; errors: number | null };
  };
  hitters: { away: HitterProjection[]; home: HitterProjection[] };
  pitchers: { away: PitcherProjection[]; home: PitcherProjection[] };
  impactPlayers: Array<{ name: string; team: string; role: string; summary: string; score: number | null }>;
  nrfiF5: NrfiF5View;
  warnings: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function asArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row) => Object.keys(row).length) : [];
}

function num(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function text(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function round(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isGenericPitcherLine(innings: number | null | undefined, strikeouts: number | null | undefined) {
  const ipGeneric = innings == null || Math.abs(innings - 5.1) <= 0.08 || Math.abs(innings - 5.2) <= 0.08 || Math.abs(innings - 5.33) <= 0.08;
  const kGeneric = strikeouts == null || Math.abs(strikeouts - 5.1) <= 0.08 || Math.abs(strikeouts - 5.2) <= 0.08;
  return ipGeneric && kGeneric;
}

function hasReliablePitcherProjection(innings: number | null | undefined, strikeouts: number | null | undefined) {
  if (innings == null || strikeouts == null) return false;
  if (!Number.isFinite(innings) || !Number.isFinite(strikeouts)) return false;
  return !isGenericPitcherLine(innings, strikeouts);
}

function parseInnings(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const whole = Math.trunc(value);
    const frac = Math.round((value - whole) * 10);
    if (frac === 1) return whole + 1 / 3;
    if (frac === 2) return whole + 2 / 3;
    return value;
  }
  if (typeof value === "string" && value.trim()) return parseInnings(Number(value));
  return null;
}

function poissonZero(lambda: number) {
  return Math.exp(-Math.max(0.01, lambda));
}

function projectedInnings(totalRuns: number | null | undefined, side: FranchiseTeamSide) {
  const total = typeof totalRuns === "number" && Number.isFinite(totalRuns) ? totalRuns : 4.3;
  const shape = side === "away"
    ? [0.13, 0.1, 0.12, 0.11, 0.12, 0.1, 0.1, 0.1, 0.12]
    : [0.12, 0.11, 0.11, 0.12, 0.11, 0.1, 0.1, 0.11, 0.1];
  return shape.map((weight) => round(total * weight, 2) ?? 0);
}

function sumFirst(values: number[], count: number) {
  return values.slice(0, count).reduce((sum, value) => sum + value, 0);
}

function projectedHits(runs: number | null | undefined) {
  return round((runs ?? 4.3) * 2.08, 1);
}

function teamActual(statsJson: unknown): TeamActualLine {
  const stats = asRecord(statsJson);
  return {
    runs: num(stats, ["runs", "R", "runs_scored", "teamRuns"]),
    hits: num(stats, ["hits", "H", "team_hits"]),
    homeRuns: num(stats, ["homeRuns", "HR", "home_runs"]),
    walks: num(stats, ["walks", "BB", "base_on_balls"]),
    strikeouts: num(stats, ["strikeouts", "SO", "K"]),
    f5Runs: num(stats, ["f5Runs", "firstFiveRuns", "runsFirstFive"])
  };
}

function playerActual(statsJson: unknown): PlayerActualLine {
  const stats = asRecord(statsJson);
  const innings = parseInnings(num(stats, ["inningsPitched", "IP", "innings_pitched"]));
  return {
    plateAppearances: num(stats, ["plateAppearances", "PA", "pa"]),
    hits: num(stats, ["hits", "H"]),
    totalBases: num(stats, ["totalBases", "TB"]),
    homeRuns: num(stats, ["homeRuns", "HR", "home_runs"]),
    runs: num(stats, ["runs", "R"]),
    rbi: num(stats, ["rbi", "RBI"]),
    strikeouts: num(stats, ["strikeouts", "SO", "K"]),
    stolenBases: num(stats, ["stolenBases", "SB"]),
    inningsPitched: innings,
    outs: num(stats, ["outs", "outsPitched", "recorded_outs"]) ?? (innings == null ? null : innings * 3),
    earnedRuns: num(stats, ["earnedRuns", "ER"]),
    hitsAllowed: num(stats, ["hitsAllowed", "H_allowed", "hits_allowed"]),
    walks: num(stats, ["walks", "BB", "baseOnBalls"])
  };
}

function avg(rows: Array<{ statsJson: unknown }>, keys: string[]) {
  const values = rows.map((row) => num(asRecord(row.statsJson), keys)).filter((value): value is number => value != null && Number.isFinite(value));
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function isPitcher(position: string | null | undefined) {
  const normalized = (position ?? "").toLowerCase();
  return normalized === "p" || normalized.includes("pitch");
}

function firstFiveFromMetadata(projection: Projection, side: FranchiseTeamSide): number | null {
  const firstFive = asRecord(asRecord(projection.mlbIntel).firstFive);
  const key = side === "home" ? "projectedHomeRuns" : "projectedAwayRuns";
  return round(typeof firstFive[key] === "number" ? firstFive[key] as number : null, 2);
}

function playerStatProjections(projection: Projection) {
  return asRecord(asRecord(asRecord(projection.mlbIntel).playerImpact).playerStatProjections);
}

function lockStarterName(projection: Projection, side: FranchiseTeamSide) {
  const lock = asRecord(asRecord(projection.mlbIntel).lock);
  const name = side === "home" ? lock.homeStarterName : lock.awayStarterName;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function buildProjectedHitter(args: {
  player: { id: string; name: string; position: string; playerGameStats: Array<{ statsJson: unknown; starter: boolean }> };
  teamName: string;
  teamSide: FranchiseTeamSide;
  order: number;
  teamProjectedRuns: number | null;
  actual: PlayerActualLine | null;
}): HitterProjection {
  const rows = args.player.playerGameStats;
  const pa = avg(rows, ["plateAppearances", "PA", "pa"]) ?? (args.order <= 5 ? 4.25 : 3.8);
  const hits = avg(rows, ["hits", "H"]) ?? 0.9;
  const totalBases = avg(rows, ["totalBases", "TB"]) ?? hits * 1.55;
  const homeRuns = avg(rows, ["homeRuns", "HR", "home_runs"]) ?? 0.12;
  const strikeouts = avg(rows, ["strikeouts", "SO", "K"]) ?? 0.95;
  const runShare = args.teamProjectedRuns != null ? args.teamProjectedRuns / 9 : 0.48;
  return {
    playerId: args.player.id,
    name: args.player.name,
    team: args.teamName,
    teamSide: args.teamSide,
    battingOrder: args.order,
    plateAppearances: round(pa, 1),
    hits: round(hits, 1),
    totalBases: round(totalBases, 1),
    homeRuns: round(homeRuns, 2),
    runs: round(runShare * (args.order <= 4 ? 1.08 : 0.92), 1),
    rbi: round(runShare * (args.order >= 3 && args.order <= 6 ? 1.12 : 0.88), 1),
    strikeouts: round(strikeouts, 1),
    stolenBaseChance: round(clamp((avg(rows, ["stolenBases", "SB"]) ?? 0.08) / 1.2, 0.01, 0.42), 2),
    actual: args.actual
  };
}

function buildPitcherProjection(args: {
  player: { id: string; name: string; playerGameStats: Array<{ statsJson: unknown; starter: boolean }> };
  teamName: string;
  teamSide: FranchiseTeamSide;
  actual: PlayerActualLine | null;
}): PitcherProjection | null {
  const rows = args.player.playerGameStats;
  const innings = avg(rows, ["inningsPitched", "IP", "innings_pitched"]);
  const strikeouts = avg(rows, ["strikeouts", "SO", "K"]);
  if (!hasReliablePitcherProjection(innings, strikeouts)) return null;
  const outs = innings == null ? null : Math.round(innings * 3);
  return {
    playerId: args.player.id,
    name: args.player.name,
    team: args.teamName,
    teamSide: args.teamSide,
    innings: round(innings, 2),
    outs,
    strikeouts: round(strikeouts, 1),
    earnedRuns: round(avg(rows, ["earnedRuns", "ER"]), 1),
    hitsAllowed: round(avg(rows, ["hitsAllowed", "hits_allowed", "H"]), 1),
    walks: round(avg(rows, ["walks", "BB", "baseOnBalls"]), 1),
    homeRuns: round(avg(rows, ["homeRuns", "HR", "home_runs"]), 1),
    actual: args.actual
  };
}

function buildSimHitterProjection(row: JsonRecord, args: { teamName: string; teamSide: FranchiseTeamSide; order: number; actual: PlayerActualLine | null }): HitterProjection {
  const id = text(row, ["playerId", "id"]) ?? `${args.teamSide}-sim-hitter-${args.order}`;
  return {
    playerId: id,
    name: text(row, ["playerName", "name"]) ?? `Projected ${args.teamName} hitter ${args.order}`,
    team: args.teamName,
    teamSide: args.teamSide,
    battingOrder: num(row, ["battingOrder", "order"]) ?? args.order,
    plateAppearances: round(num(row, ["expectedPlateAppearances", "plateAppearances", "pa"]), 1),
    hits: round(num(row, ["expectedHits", "hits"]), 1),
    totalBases: round(num(row, ["expectedTotalBases", "totalBases"]), 1),
    homeRuns: round(num(row, ["expectedHomeRuns", "homeRuns"]), 2),
    runs: round(num(row, ["expectedRuns", "runs"]), 1),
    rbi: round(num(row, ["expectedRbi", "expectedRBI", "rbi"]), 1),
    strikeouts: round(num(row, ["expectedStrikeouts", "strikeouts"]), 1),
    stolenBaseChance: round(num(row, ["stolenBaseProbability", "stolenBaseChance", "stealAttemptProbability"]), 2),
    actual: args.actual
  };
}

function buildSimPitcherProjection(row: JsonRecord, args: { teamName: string; teamSide: FranchiseTeamSide; actual: PlayerActualLine | null }): PitcherProjection | null {
  const id = text(row, ["pitcherId", "playerId", "id"]);
  const name = text(row, ["pitcherName", "playerName", "name"]);
  const innings = num(row, ["expectedInningsPitched", "innings"]);
  const strikeouts = num(row, ["expectedStrikeouts", "strikeouts"]);
  if (!name || !hasReliablePitcherProjection(innings, strikeouts)) return null;
  const outs = num(row, ["expectedOuts", "outs"]) ?? (innings == null ? null : innings * 3);
  return {
    playerId: id,
    name,
    team: args.teamName,
    teamSide: args.teamSide,
    innings: round(innings, 2),
    outs: round(outs, 0),
    strikeouts: round(strikeouts, 1),
    earnedRuns: round(num(row, ["expectedEarnedRuns", "earnedRuns"]), 1),
    hitsAllowed: round(num(row, ["expectedHitsAllowed", "hitsAllowed"]), 1),
    walks: round(num(row, ["expectedWalksAllowed", "walks"]), 1),
    homeRuns: round(num(row, ["expectedHomeRunsAllowed", "homeRuns"]), 1),
    actual: args.actual
  };
}

function simHitters(projection: Projection, side: FranchiseTeamSide, teamName: string, actualByPlayer: Map<string, PlayerActualLine>) {
  const stats = playerStatProjections(projection);
  const key = side === "home" ? "homeHitters" : "awayHitters";
  return asArray(stats[key]).slice(0, 9).map((row, index) => {
    const id = text(row, ["playerId", "id"]);
    return buildSimHitterProjection(row, { teamName, teamSide: side, order: index + 1, actual: id ? actualByPlayer.get(id) ?? null : null });
  });
}

function simStarter(projection: Projection, side: FranchiseTeamSide, teamName: string, actualByPlayer: Map<string, PlayerActualLine>) {
  const stats = playerStatProjections(projection);
  const key = side === "home" ? "homeStarter" : "awayStarter";
  const row = asRecord(stats[key]);
  if (!Object.keys(row).length) return null;
  const id = text(row, ["pitcherId", "playerId", "id"]);
  return buildSimPitcherProjection(row, { teamName, teamSide: side, actual: id ? actualByPlayer.get(id) ?? null : null });
}

function buildNrfiF5(projection: Projection, awayInnings: number[], homeInnings: number[]): NrfiF5View {
  const f5AwayRuns = firstFiveFromMetadata(projection, "away") ?? round(sumFirst(awayInnings, 5), 2);
  const f5HomeRuns = firstFiveFromMetadata(projection, "home") ?? round(sumFirst(homeInnings, 5), 2);
  const f5Total = round((f5AwayRuns ?? 0) + (f5HomeRuns ?? 0), 2);
  const inningOneTotal = (awayInnings[0] ?? 0) + (homeInnings[0] ?? 0);
  const nrfiPct = round(poissonZero(inningOneTotal), 3);
  const yrfiPct = nrfiPct == null ? null : round(1 - nrfiPct, 3);
  const f5AwayWinPct = f5AwayRuns != null && f5HomeRuns != null ? round(clamp(0.5 + (f5AwayRuns - f5HomeRuns) * 0.09, 0.18, 0.78), 3) : null;
  const f5HomeWinPct = f5AwayRuns != null && f5HomeRuns != null ? round(clamp(0.5 + (f5HomeRuns - f5AwayRuns) * 0.09, 0.18, 0.78), 3) : null;
  const f5TiePct = f5AwayWinPct != null && f5HomeWinPct != null ? round(clamp(1 - Math.max(f5AwayWinPct, f5HomeWinPct), 0.08, 0.28), 3) : null;
  return {
    nrfiPct,
    yrfiPct,
    f5Total,
    f5AwayRuns,
    f5HomeRuns,
    f5Over45Pct: f5Total == null ? null : round(clamp(0.5 + (f5Total - 4.5) * 0.12, 0.12, 0.88), 3),
    f5AwayWinPct,
    f5HomeWinPct,
    f5TiePct,
    innings: Array.from({ length: 5 }, (_, index) => {
      const awayRuns = awayInnings[index] ?? 0;
      const homeRuns = homeInnings[index] ?? 0;
      const totalRuns = awayRuns + homeRuns;
      return { inning: index + 1, awayRuns, homeRuns, totalRuns: round(totalRuns, 2) ?? 0, noRunPct: round(poissonZero(totalRuns), 3) ?? 0 };
    })
  };
}

async function resolveTeams(detail: CachedDetail) {
  const event = await prisma.event.findUnique({
    where: { id: detail.row.game.id },
    include: { participants: { include: { competitor: { include: { team: true } } } } }
  }).catch(() => null);
  const awayParticipant = event?.participants.find((row) => row.role === "AWAY") ?? null;
  const homeParticipant = event?.participants.find((row) => row.role === "HOME") ?? null;
  const awayTeam = awayParticipant?.competitor.team ?? null;
  const homeTeam = homeParticipant?.competitor.team ?? null;
  return { event, awayTeam, homeTeam };
}

async function resolveGameId(detail: CachedDetail, eventExternalId: string | null | undefined) {
  const game = await prisma.game.findFirst({
    where: {
      OR: [
        { id: detail.row.game.id },
        { externalEventId: detail.row.game.id },
        ...(eventExternalId ? [{ externalEventId: eventExternalId }] : [])
      ]
    },
    select: { id: true }
  }).catch(() => null);
  return game?.id ?? null;
}

function notNull<T>(value: T | null): value is T {
  return value !== null;
}

export async function getMlbFranchiseGameCenter(gameId: string): Promise<MlbFranchiseGameCenter | null> {
  const detail = await readCachedMlbGameDetail(gameId);
  if (!detail) return null;

  const projection = detail.row.projection;
  const warnings: string[] = [];
  const { event, awayTeam, homeTeam } = await resolveTeams(detail);
  const resolvedGameId = await resolveGameId(detail, event?.externalEventId ?? null);
  const awayName = awayTeam?.name ?? projection.matchup.away;
  const homeName = homeTeam?.name ?? projection.matchup.home;
  const awayRuns = round(projection.distribution.avgAway, 2);
  const homeRuns = round(projection.distribution.avgHome, 2);
  const awayInnings = projectedInnings(awayRuns, "away");
  const homeInnings = projectedInnings(homeRuns, "home");

  if (!resolvedGameId) warnings.push("Actual box-score tracking is not linked to this cached game yet.");

  const [teamActualRows, playerRows, statsApiStarters] = await Promise.all([
    resolvedGameId ? prisma.teamGameStat.findMany({ where: { gameId: resolvedGameId }, orderBy: { updatedAt: "desc" } }) : Promise.resolve([]),
    (awayTeam?.id || homeTeam?.id)
      ? prisma.player.findMany({
          where: { teamId: { in: [awayTeam?.id, homeTeam?.id].filter((id): id is string => Boolean(id)) } },
          include: {
            playerGameStats: {
              orderBy: { createdAt: "desc" },
              take: 8
            }
          },
          orderBy: { name: "asc" }
        })
      : Promise.resolve([]),
    buildMlbProbablePitcherStatProjections({
      gameDate: event?.startTime ?? null,
      awayTeam: { name: awayName, abbreviation: awayTeam?.abbreviation ?? null, externalIds: awayTeam?.externalIds ?? null },
      homeTeam: { name: homeName, abbreviation: homeTeam?.abbreviation ?? null, externalIds: homeTeam?.externalIds ?? null }
    }).catch((error) => ({
      awayStarter: null,
      homeStarter: null,
      warnings: [`MLB Stats API probable pitcher projection failed: ${error instanceof Error ? error.message : String(error)}`]
    }))
  ]);
  warnings.push(...statsApiStarters.warnings);

  const typedTeamActualRows = teamActualRows as Array<{ teamId: string; statsJson: unknown }>;
  const typedPlayerRows = playerRows as Array<{
    id: string;
    name: string;
    teamId: string | null;
    position: string | null;
    playerGameStats: Array<{ gameId: string | null; starter: boolean | null; statsJson: unknown }>;
  }>;

  const actualByTeam = new Map(typedTeamActualRows.map((row) => [row.teamId, teamActual(row.statsJson)]));
  const actualByPlayer = new Map<string, PlayerActualLine>();
  for (const player of typedPlayerRows) {
    const current = resolvedGameId ? player.playerGameStats.find((row) => row.gameId === resolvedGameId) : null;
    if (current) actualByPlayer.set(player.id, playerActual(current.statsJson));
  }

  const hitters = typedPlayerRows.filter((player) => !isPitcher(player.position));
  const pitchers = typedPlayerRows.filter((player) => isPitcher(player.position));
  const linkedAwayHitters = hitters.filter((player) => player.teamId === awayTeam?.id).slice(0, 9).map((player, index) => buildProjectedHitter({ player, teamName: awayName, teamSide: "away", order: index + 1, teamProjectedRuns: awayRuns, actual: actualByPlayer.get(player.id) ?? null }));
  const linkedHomeHitters = hitters.filter((player) => player.teamId === homeTeam?.id).slice(0, 9).map((player, index) => buildProjectedHitter({ player, teamName: homeName, teamSide: "home", order: index + 1, teamProjectedRuns: homeRuns, actual: actualByPlayer.get(player.id) ?? null }));
  const simAwayHitters = simHitters(projection, "away", awayName, actualByPlayer);
  const simHomeHitters = simHitters(projection, "home", homeName, actualByPlayer);
  const awayHitters = linkedAwayHitters.length >= 5 ? linkedAwayHitters : simAwayHitters.length ? simAwayHitters : linkedAwayHitters;
  const homeHitters = linkedHomeHitters.length >= 5 ? linkedHomeHitters : simHomeHitters.length ? simHomeHitters : linkedHomeHitters;

  const linkedAwayPitchers = pitchers.filter((player) => player.teamId === awayTeam?.id).sort((a, b) => b.playerGameStats.filter((row) => row.starter).length - a.playerGameStats.filter((row) => row.starter).length).slice(0, 3).map((player) => buildPitcherProjection({ player, teamName: awayName, teamSide: "away", actual: actualByPlayer.get(player.id) ?? null })).filter(notNull);
  const linkedHomePitchers = pitchers.filter((player) => player.teamId === homeTeam?.id).sort((a, b) => b.playerGameStats.filter((row) => row.starter).length - a.playerGameStats.filter((row) => row.starter).length).slice(0, 3).map((player) => buildPitcherProjection({ player, teamName: homeName, teamSide: "home", actual: actualByPlayer.get(player.id) ?? null })).filter(notNull);
  const simAwayStarter = simStarter(projection, "away", awayName, actualByPlayer);
  const simHomeStarter = simStarter(projection, "home", homeName, actualByPlayer);

  const awayStarter = linkedAwayPitchers[0] ?? simAwayStarter ?? statsApiStarters.awayStarter ?? null;
  const homeStarter = linkedHomePitchers[0] ?? simHomeStarter ?? statsApiStarters.homeStarter ?? null;
  const awayPitchers = awayStarter ? [awayStarter, ...linkedAwayPitchers.filter((row) => row.playerId !== awayStarter.playerId).slice(0, 2)] : linkedAwayPitchers;
  const homePitchers = homeStarter ? [homeStarter, ...linkedHomePitchers.filter((row) => row.playerId !== homeStarter.playerId).slice(0, 2)] : linkedHomePitchers;

  const impactPlayers = [
    ...awayHitters.slice(0, 2).map((player) => ({ name: player.name, team: player.team, role: `Bat ${player.battingOrder ?? "--"}`, summary: `${player.hits ?? "--"} H, ${player.totalBases ?? "--"} TB projection.`, score: (player.totalBases ?? 0) + (player.homeRuns ?? 0) * 2 })),
    ...homeHitters.slice(0, 2).map((player) => ({ name: player.name, team: player.team, role: `Bat ${player.battingOrder ?? "--"}`, summary: `${player.hits ?? "--"} H, ${player.totalBases ?? "--"} TB projection.`, score: (player.totalBases ?? 0) + (player.homeRuns ?? 0) * 2 })),
    ...(awayStarter ? [{ name: awayStarter.name, team: awayStarter.team, role: "Starter", summary: `${awayStarter.innings ?? "--"} IP, ${awayStarter.strikeouts ?? "--"} K projection.`, score: (awayStarter.strikeouts ?? 0) + (awayStarter.outs ?? 0) / 6 }] : []),
    ...(homeStarter ? [{ name: homeStarter.name, team: homeStarter.team, role: "Starter", summary: `${homeStarter.innings ?? "--"} IP, ${homeStarter.strikeouts ?? "--"} K projection.`, score: (homeStarter.strikeouts ?? 0) + (homeStarter.outs ?? 0) / 6 }] : [])
  ].sort((left, right) => (right.score ?? 0) - (left.score ?? 0)).slice(0, 6);

  const awayLockName = lockStarterName(projection, "away");
  const homeLockName = lockStarterName(projection, "home");
  if (!linkedAwayHitters.length && simAwayHitters.length) warnings.push(`${awayName} hitter rows are using cached sim player-stat projections because linked PlayerGameStat rows are missing.`);
  if (!linkedHomeHitters.length && simHomeHitters.length) warnings.push(`${homeName} hitter rows are using cached sim player-stat projections because linked PlayerGameStat rows are missing.`);
  if (!awayHitters.length && !homeHitters.length) warnings.push("Projected hitter box score needs playerStatProjections in the cached sim or linked PlayerGameStat rows.");
  if (!awayStarter) warnings.push(`${awayLockName ? `${awayLockName} ` : awayName}starter projection suppressed: no linked pitcher stats, non-generic cached sim starter projection, or MLB Stats API probable-pitcher season stats.`);
  if (!homeStarter) warnings.push(`${homeLockName ? `${homeLockName} ` : homeName}starter projection suppressed: no linked pitcher stats, non-generic cached sim starter projection, or MLB Stats API probable-pitcher season stats.`);
  if (!typedTeamActualRows.length) warnings.push("Actual team box score is not tracked yet for this game.");

  return {
    gameId,
    game: detail.row.game,
    projection,
    edge: detail.edge,
    cacheLabel: `${cacheAgeLabel(detail.generatedAt)}${detail.stale ? " - stale" : ""}`,
    stale: detail.stale,
    teams: {
      away: { side: "away", name: awayName, teamId: awayTeam?.id ?? null, abbreviation: awayTeam?.abbreviation ?? null, projectedRuns: awayRuns, winPct: projection.distribution.awayWinPct, f5Runs: firstFiveFromMetadata(projection, "away") ?? round(sumFirst(awayInnings, 5), 2), actual: awayTeam?.id ? actualByTeam.get(awayTeam.id) ?? null : null, starter: awayStarter },
      home: { side: "home", name: homeName, teamId: homeTeam?.id ?? null, abbreviation: homeTeam?.abbreviation ?? null, projectedRuns: homeRuns, winPct: projection.distribution.homeWinPct, f5Runs: firstFiveFromMetadata(projection, "home") ?? round(sumFirst(homeInnings, 5), 2), actual: homeTeam?.id ? actualByTeam.get(homeTeam.id) ?? null : null, starter: homeStarter }
    },
    lineScore: {
      away: { name: awayName, runs: awayRuns, innings: awayInnings, hits: projectedHits(awayRuns), errors: 0 },
      home: { name: homeName, runs: homeRuns, innings: homeInnings, hits: projectedHits(homeRuns), errors: 0 }
    },
    hitters: { away: awayHitters, home: homeHitters },
    pitchers: { away: awayPitchers, home: homePitchers },
    impactPlayers,
    nrfiF5: buildNrfiF5(projection, awayInnings, homeInnings),
    warnings
  };
}
