import { PrismaClient } from "@prisma/client";

import { buildRollingMlbEloSnapshots } from "@/services/data/retrosheet/feature-builder";

const prisma = new PrismaClient();
const SOURCE_KEY = "RETROSHEET";
const ROLLING_PITCHER_GAMES = 5;

async function main() {
  const games = await prisma.retrosheetGame.findMany({
    where: {
      sourceKey: SOURCE_KEY,
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

  for (const snapshot of eloSnapshots) {
    await prisma.mlbTeamEloSnapshot.upsert({
      where: {
        teamId_retrosheetGameId: {
          teamId: snapshot.teamId,
          retrosheetGameId: snapshot.retrosheetGameId
        }
      },
      create: {
        ...snapshot,
        sourceKey: SOURCE_KEY
      },
      update: {
        ...snapshot,
        sourceKey: SOURCE_KEY
      }
    });
  }

  const pitchingRows = await prisma.retrosheetPitchingGameStat.findMany({
    where: { sourceKey: SOURCE_KEY },
    orderBy: [
      { gameDate: "asc" },
      { retrosheetGameId: "asc" }
    ]
  });
  const pitcherScores = new Map<string, number[]>();
  let pitcherSnapshots = 0;

  for (const row of pitchingRows) {
    const previousScores = pitcherScores.get(row.pitcherId) ?? [];
    if (previousScores.length > 0) {
      const window = previousScores.slice(-ROLLING_PITCHER_GAMES);
      const rollingGameScore = window.reduce((sum, score) => sum + score, 0) / window.length;
      await prisma.mlbPitcherRollingSnapshot.upsert({
        where: {
          pitcherId_retrosheetGameId: {
            pitcherId: row.pitcherId,
            retrosheetGameId: row.retrosheetGameId
          }
        },
        create: {
          sourceKey: SOURCE_KEY,
          pitcherId: row.pitcherId,
          teamId: row.teamId,
          season: row.season,
          gameDate: row.gameDate,
          retrosheetGameId: row.retrosheetGameId,
          rollingGameScore,
          gamesIncluded: window.length,
          gameScore: row.gameScore
        },
        update: {
          sourceKey: SOURCE_KEY,
          teamId: row.teamId,
          season: row.season,
          gameDate: row.gameDate,
          rollingGameScore,
          gamesIncluded: window.length,
          gameScore: row.gameScore
        }
      });
      pitcherSnapshots += 1;
    }
    pitcherScores.set(row.pitcherId, [...previousScores, row.gameScore]);
  }

  console.log(JSON.stringify({
    ok: true,
    sourceKey: SOURCE_KEY,
    gamesProcessed: games.length,
    eloSnapshots: eloSnapshots.length,
    pitchingRows: pitchingRows.length,
    pitcherSnapshots
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
