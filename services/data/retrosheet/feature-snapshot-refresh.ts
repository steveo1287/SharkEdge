import { prisma } from "@/lib/db/prisma";
import { buildRollingMlbEloSnapshots } from "@/services/data/retrosheet/feature-builder";

const DEFAULT_SOURCE_KEY = "RETROSHEET";
const ROLLING_PITCHER_GAMES = 5;
const CHUNK_SIZE = 500;

async function chunkCreate<T>(items: T[], fn: (chunk: T[]) => Promise<void>) {
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    await fn(items.slice(i, i + CHUNK_SIZE));
  }
}

export async function getRetrosheetFeatureSnapshotStatus(sourceKey = DEFAULT_SOURCE_KEY) {
  const [
    games,
    teamStats,
    pitchingRows,
    eloSnapshots,
    pitcherSnapshots
  ] = await Promise.all([
    prisma.retrosheetGame.count({ where: { sourceKey } }),
    prisma.retrosheetTeamGameStat.count({ where: { sourceKey } }),
    prisma.retrosheetPitchingGameStat.count({ where: { sourceKey } }),
    prisma.mlbTeamEloSnapshot.count({ where: { sourceKey } }),
    prisma.mlbPitcherRollingSnapshot.count({ where: { sourceKey } })
  ]);

  return {
    sourceKey,
    games,
    teamStats,
    pitchingRows,
    eloSnapshots,
    pitcherSnapshots,
    warnings: [
      games ? null : `No ${sourceKey} game rows are imported.`,
      pitchingRows ? null : `No ${sourceKey} pitching rows are imported; pitcher rolling game-score snapshots cannot be built.`
    ].filter((warning): warning is string => Boolean(warning))
  };
}

export async function refreshRetrosheetFeatureSnapshots(options: {
  sourceKey?: string;
  rebuild?: boolean;
} = {}) {
  const sourceKey = options.sourceKey ?? DEFAULT_SOURCE_KEY;
  const startedAt = Date.now();

  const games = await prisma.retrosheetGame.findMany({
    where: {
      sourceKey,
      homeScore: { not: null },
      awayScore: { not: null }
    },
    orderBy: [
      { gameDate: "asc" },
      { retrosheetGameId: "asc" }
    ]
  });

  const eloSnapshots = buildRollingMlbEloSnapshots(
    games.map((game) => ({
      retrosheetGameId: game.retrosheetGameId,
      gameDate: game.gameDate,
      season: game.season,
      homeTeamId: game.homeTeamId,
      awayTeamId: game.awayTeamId,
      homeScore: game.homeScore ?? 0,
      awayScore: game.awayScore ?? 0,
      isPostseason: game.isPostseason
    }))
  );

  const pitchingRows = await prisma.retrosheetPitchingGameStat.findMany({
    where: { sourceKey },
    orderBy: [
      { gameDate: "asc" },
      { retrosheetGameId: "asc" }
    ]
  });

  const pitcherScores = new Map<string, number[]>();
  const pitcherSnapshots = [];
  for (const row of pitchingRows) {
    const previousScores = pitcherScores.get(row.pitcherId) ?? [];
    if (previousScores.length > 0) {
      const window = previousScores.slice(-ROLLING_PITCHER_GAMES);
      pitcherSnapshots.push({
        sourceKey,
        pitcherId: row.pitcherId,
        teamId: row.teamId,
        season: row.season,
        gameDate: row.gameDate,
        retrosheetGameId: row.retrosheetGameId,
        rollingGameScore: window.reduce((sum, score) => sum + score, 0) / window.length,
        gamesIncluded: window.length,
        gameScore: row.gameScore
      });
    }
    pitcherScores.set(row.pitcherId, [...previousScores, row.gameScore]);
  }

  if (options.rebuild) {
    await prisma.mlbTeamEloSnapshot.deleteMany({ where: { sourceKey } });
    await prisma.mlbPitcherRollingSnapshot.deleteMany({ where: { sourceKey } });
  }

  await chunkCreate(eloSnapshots, async (chunk) => {
    await prisma.mlbTeamEloSnapshot.createMany({
      data: chunk.map((snapshot) => ({
        ...snapshot,
        sourceKey
      })),
      skipDuplicates: true
    });
  });

  await chunkCreate(pitcherSnapshots, async (chunk) => {
    await prisma.mlbPitcherRollingSnapshot.createMany({
      data: chunk,
      skipDuplicates: true
    });
  });

  const status = await getRetrosheetFeatureSnapshotStatus(sourceKey);
  return {
    ok: status.warnings.length === 0 || status.eloSnapshots > 0,
    sourceKey,
    rebuild: Boolean(options.rebuild),
    elapsedMs: Date.now() - startedAt,
    gamesProcessed: games.length,
    eloSnapshotsPrepared: eloSnapshots.length,
    pitchingRows: pitchingRows.length,
    pitcherSnapshotsPrepared: pitcherSnapshots.length,
    status
  };
}
