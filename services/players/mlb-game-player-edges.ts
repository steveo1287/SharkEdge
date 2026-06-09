import { hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import { ensureMlbRosterIntelligenceTables } from "@/services/simulation/mlb-roster-intelligence";
import { getMlbMatchupPlayerEdges, type MlbMatchupPlayerEdgeBoard } from "@/services/players/mlb-matchup-player-edges";

export type MlbGamePlayerEdgeSnapshot = {
  team: string;
  confirmed: boolean;
  startingPitcherId: string | null;
  startingPitcherName: string | null;
  capturedAt: string | null;
  source: string | null;
};

export type MlbGamePlayerEdgeBoard = {
  ok: boolean;
  generatedAt: string;
  gameId: string;
  inferredAwayTeam: string | null;
  inferredHomeTeam: string | null;
  lineupSnapshots: MlbGamePlayerEdgeSnapshot[];
  matchup: MlbMatchupPlayerEdgeBoard;
  warnings: string[];
};

type LineupTeamRow = {
  team: string;
  confirmed: boolean;
  starting_pitcher_id: string | null;
  starting_pitcher_name: string | null;
  captured_at: Date | string | null;
  source: string | null;
};

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeSnapshot(row: LineupTeamRow): MlbGamePlayerEdgeSnapshot {
  return {
    team: row.team,
    confirmed: row.confirmed,
    startingPitcherId: row.starting_pitcher_id,
    startingPitcherName: row.starting_pitcher_name,
    capturedAt: toIso(row.captured_at),
    source: row.source
  };
}

async function latestGameLineupTeams(gameId: string) {
  await ensureMlbRosterIntelligenceTables();
  const rows = await prisma.$queryRaw<LineupTeamRow[]>`
    SELECT DISTINCT ON (team)
      team, confirmed, starting_pitcher_id, starting_pitcher_name, captured_at, source
    FROM mlb_lineup_snapshots
    WHERE game_id = ${gameId}
    ORDER BY team, captured_at DESC;
  `;
  return rows.map(normalizeSnapshot);
}

export async function getMlbGamePlayerEdges(args: { gameId: string; away?: string | null; home?: string | null }): Promise<MlbGamePlayerEdgeBoard> {
  if (!hasUsableServerDatabaseUrl()) {
    const matchup = await getMlbMatchupPlayerEdges({ away: args.away, home: args.home });
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      gameId: args.gameId,
      inferredAwayTeam: args.away ?? null,
      inferredHomeTeam: args.home ?? null,
      lineupSnapshots: [],
      matchup,
      warnings: ["No usable server database URL is configured.", ...matchup.warnings]
    };
  }

  try {
    const snapshots = await latestGameLineupTeams(args.gameId);
    const inferredAway = args.away?.trim() || snapshots[0]?.team || null;
    const inferredHome = args.home?.trim() || snapshots.find((item) => item.team !== inferredAway)?.team || null;
    const matchup = await getMlbMatchupPlayerEdges({ away: inferredAway, home: inferredHome });
    const warnings = [...matchup.warnings];
    if (!snapshots.length) warnings.push(`No lineup snapshots found for game ${args.gameId}. Pass away/home teams manually or seed lineups.`);
    if (!inferredAway || !inferredHome) warnings.push("Could not infer both teams for game-level player edges.");
    return {
      ok: matchup.ok && Boolean(inferredAway && inferredHome),
      generatedAt: new Date().toISOString(),
      gameId: args.gameId,
      inferredAwayTeam: inferredAway,
      inferredHomeTeam: inferredHome,
      lineupSnapshots: snapshots,
      matchup,
      warnings
    };
  } catch (error) {
    const matchup = await getMlbMatchupPlayerEdges({ away: args.away, home: args.home });
    return {
      ok: false,
      generatedAt: new Date().toISOString(),
      gameId: args.gameId,
      inferredAwayTeam: args.away ?? null,
      inferredHomeTeam: args.home ?? null,
      lineupSnapshots: [],
      matchup,
      warnings: [error instanceof Error ? error.message : "Unknown game player edge error.", ...matchup.warnings]
    };
  }
}
