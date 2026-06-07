import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { LeagueKey } from "@/lib/types/domain";
import { buildBoardSportSections } from "@/services/events/live-score-service";
import { readCachedMlbGameDetail } from "@/services/simulation/mlb-game-detail-cache";
import { buildMainSimProjection } from "@/services/simulation/main-sim-brain";
import type { MlbInningMarketProjection, MlbPlayerStatProjectionGame } from "@/services/simulation/mlb-player-stat-inning-engine";

export type FranchiseGame = { id: string; label: string; startTime: string; status: string; leagueKey: LeagueKey; leagueLabel: string };
export type FranchiseProjection = Awaited<ReturnType<typeof buildMainSimProjection>>;

export type FranchiseTeamRow = {
  teamId: string;
  name: string;
  stats: Record<string, unknown>;
};

export type FranchisePlayerRow = {
  playerId: string;
  playerName: string;
  starter: boolean;
  status: string | null;
  stats: Record<string, unknown>;
};

export type MlbFranchiseGameStats = {
  game: FranchiseGame;
  projection: FranchiseProjection;
  playerStats: MlbPlayerStatProjectionGame | null;
  inningStats: MlbInningMarketProjection | null;
  actualTeams: FranchiseTeamRow[];
  actualPlayers: FranchisePlayerRow[];
  source: "cache" | "live";
  warnings: string[];
};

type TeamActualRow = {
  team_id: string;
  team_key: string | null;
  abbreviation: string | null;
  name: string | null;
  stats_json: unknown;
};

type PlayerActualRow = {
  player_id: string;
  player_name: string | null;
  starter: boolean;
  outcome_status: string | null;
  stats_json: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function statNumber(stats: unknown, keys: string[]) {
  if (!isRecord(stats)) return null;
  for (const key of keys) {
    const value = stats[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  for (const group of ["batting", "pitching", "running", "fielding", "team"] as const) {
    const bucket = stats[group];
    if (!isRecord(bucket)) continue;
    for (const key of keys) {
      const value = bucket[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
    }
  }
  return null;
}

export function statText(stats: unknown, keys: string[], fallback = "—") {
  const value = statNumber(stats, keys);
  if (value == null) return fallback;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function playerImpact(projection: FranchiseProjection) {
  const impact = isRecord(projection.mlbIntel?.playerImpact) ? projection.mlbIntel?.playerImpact : null;
  return {
    playerStats: impact?.playerStatProjections as MlbPlayerStatProjectionGame | null | undefined,
    inningStats: impact?.inningProjection as MlbInningMarketProjection | null | undefined
  };
}

async function loadLive(gameId: string) {
  const sections = await buildBoardSportSections({ selectedLeague: "MLB", gamesByLeague: {}, maxScoreboardGames: null });
  const game = sections
    .flatMap((section) => section.scoreboard.map((item) => ({ ...item, leagueKey: section.leagueKey, leagueLabel: section.leagueLabel })))
    .find((item) => item.id === gameId);
  if (!game) return null;
  const projection = await buildMainSimProjection(game);
  return { game, projection, source: "live" as const };
}

async function loadActualRows(gameId: string) {
  if (!hasUsableServerDatabaseUrl()) {
    return { actualTeams: [] as FranchiseTeamRow[], actualPlayers: [] as FranchisePlayerRow[], warning: "Tracked box-score stats unavailable." };
  }
  try {
    const [teams, players] = await Promise.all([
      prisma.$queryRaw<TeamActualRow[]>`
        SELECT tgs.team_id, t.key AS team_key, t.abbreviation, t.name, tgs.stats_json
        FROM team_game_stats tgs
        LEFT JOIN teams t ON t.id = tgs.team_id
        WHERE tgs.game_id = ${gameId}
        ORDER BY t.abbreviation ASC NULLS LAST, t.name ASC NULLS LAST
      `,
      prisma.$queryRaw<PlayerActualRow[]>`
        SELECT pgs.player_id, p.name AS player_name, pgs.starter, pgs.outcome_status, pgs.stats_json
        FROM player_game_stats pgs
        LEFT JOIN players p ON p.id = pgs.player_id
        WHERE pgs.game_id = ${gameId}
        ORDER BY pgs.starter DESC, p.name ASC NULLS LAST
      `
    ]);
    return {
      actualTeams: teams.map((row) => ({
        teamId: row.team_id,
        name: row.abbreviation ?? row.team_key ?? row.name ?? row.team_id,
        stats: isRecord(row.stats_json) ? row.stats_json : {}
      })),
      actualPlayers: players.map((row) => ({
        playerId: row.player_id,
        playerName: row.player_name ?? row.player_id,
        starter: row.starter,
        status: row.outcome_status,
        stats: isRecord(row.stats_json) ? row.stats_json : {}
      })),
      warning: null as string | null
    };
  } catch (error) {
    return {
      actualTeams: [] as FranchiseTeamRow[],
      actualPlayers: [] as FranchisePlayerRow[],
      warning: error instanceof Error ? `Tracked box-score stats unavailable: ${error.message}` : "Tracked box-score stats unavailable."
    };
  }
}

export async function getMlbFranchiseGameStats(gameId: string): Promise<MlbFranchiseGameStats | null> {
  const cached = await readCachedMlbGameDetail(gameId);
  const base = cached
    ? { game: cached.row.game as FranchiseGame, projection: cached.row.projection as FranchiseProjection, source: "cache" as const }
    : await loadLive(gameId);
  if (!base) return null;

  const impact = playerImpact(base.projection);
  const actual = await loadActualRows(gameId);
  const warnings = [actual.warning].filter((value): value is string => Boolean(value));

  return {
    game: base.game,
    projection: base.projection,
    playerStats: impact.playerStats ?? null,
    inningStats: impact.inningStats ?? null,
    actualTeams: actual.actualTeams,
    actualPlayers: actual.actualPlayers,
    source: base.source,
    warnings
  };
}
