import { prisma } from "@/lib/db/prisma";
import { buildRollingMlbEloSnapshots } from "@/services/data/retrosheet/feature-builder";
import type { MlbEloGameInput } from "@/services/data/retrosheet/feature-builder";

const SOURCE_KEY = "SPINE";
const CHUNK_SIZE = 500;
const db = prisma as any;

type SpineGameRow = {
  game_pk: number;
  official_date: Date;
  season: number;
  home_team_id: number;
  away_team_id: number;
  home_score: number;
  away_score: number;
};

async function chunkCreate<T>(items: T[], fn: (chunk: T[]) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    await fn(items.slice(i, i + CHUNK_SIZE));
  }
}

export async function buildSpineEloSnapshots(): Promise<{
  gamesProcessed: number;
  teamsUpdated: number;
  eloRowsUpserted: number;
}> {
  const rows = (await db.$queryRaw<SpineGameRow[]>`
    SELECT
      game_pk,
      official_date,
      EXTRACT(YEAR FROM official_date)::integer AS season,
      home_team_id,
      away_team_id,
      home_score,
      away_score
    FROM mlb_betting_games
    WHERE is_final = true
      AND home_score IS NOT NULL
      AND away_score IS NOT NULL
      AND home_team_id IS NOT NULL
      AND away_team_id IS NOT NULL
    ORDER BY official_date ASC, game_pk ASC
  `) as SpineGameRow[];

  if (!rows.length) return { gamesProcessed: 0, teamsUpdated: 0, eloRowsUpserted: 0 };

  // 1. Insert retrosheet_games (spine-sourced). skipDuplicates makes this idempotent.
  await chunkCreate<SpineGameRow>(rows, async (chunk) => {
    await db.retrosheetGame.createMany({
      data: chunk.map((row) => ({
        retrosheetGameId: `spine:${row.game_pk}`,
        sourceKey: SOURCE_KEY,
        gameDate: new Date(row.official_date),
        season: Number(row.season),
        homeTeamId: String(row.home_team_id),
        awayTeamId: String(row.away_team_id),
        homeScore: Number(row.home_score),
        awayScore: Number(row.away_score),
        isPostseason: false,
      })),
      skipDuplicates: true,
    });
  });

  // 2. Insert retrosheet_team_game_stats (home + away row per game).
  const statRows: Array<{
    retrosheetGameId: string;
    teamId: string;
    opponentTeamId: string;
    isHome: boolean;
    sourceKey: string;
    gameDate: Date;
    season: number;
    runs: number;
    runsAllowed: number;
  }> = rows.flatMap((row) => [
    {
      retrosheetGameId: `spine:${row.game_pk}`,
      teamId: String(row.home_team_id),
      opponentTeamId: String(row.away_team_id),
      isHome: true,
      sourceKey: SOURCE_KEY,
      gameDate: new Date(row.official_date),
      season: Number(row.season),
      runs: Number(row.home_score),
      runsAllowed: Number(row.away_score),
    },
    {
      retrosheetGameId: `spine:${row.game_pk}`,
      teamId: String(row.away_team_id),
      opponentTeamId: String(row.home_team_id),
      isHome: false,
      sourceKey: SOURCE_KEY,
      gameDate: new Date(row.official_date),
      season: Number(row.season),
      runs: Number(row.away_score),
      runsAllowed: Number(row.home_score),
    },
  ]);
  await chunkCreate(statRows, async (chunk) => {
    await db.retrosheetTeamGameStat.createMany({ data: chunk, skipDuplicates: true });
  });

  // 3. Compute rolling Elo from the full chronological game sequence.
  const gameInputs: MlbEloGameInput[] = rows.map((row) => ({
    retrosheetGameId: `spine:${row.game_pk}`,
    gameDate: new Date(row.official_date),
    season: Number(row.season),
    homeTeamId: String(row.home_team_id),
    awayTeamId: String(row.away_team_id),
    homeScore: Number(row.home_score),
    awayScore: Number(row.away_score),
    isPostseason: false,
  }));
  const snapshots = buildRollingMlbEloSnapshots(gameInputs);

  // 4. Replace all SPINE Elo snapshots so rating history stays accurate after score corrections.
  await db.mlbTeamEloSnapshot.deleteMany({ where: { sourceKey: SOURCE_KEY } });
  await chunkCreate(snapshots, async (chunk) => {
    await db.mlbTeamEloSnapshot.createMany({
      data: chunk.map((snap) => ({
        sourceKey: SOURCE_KEY,
        teamId: snap.teamId,
        season: snap.season,
        gameDate: snap.gameDate,
        retrosheetGameId: snap.retrosheetGameId,
        preGameElo: snap.preGameElo,
        postGameElo: snap.postGameElo,
        opponentTeamId: snap.opponentTeamId,
        expectedWinProbability: snap.expectedWinProbability,
        actualResult: snap.actualResult,
        kFactor: snap.kFactor,
        isPostseason: snap.isPostseason,
      })),
      skipDuplicates: true,
    });
  });

  const teamIds = new Set(snapshots.map((s) => s.teamId));

  return {
    gamesProcessed: rows.length,
    teamsUpdated: teamIds.size,
    eloRowsUpserted: snapshots.length,
  };
}
