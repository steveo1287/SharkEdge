import { Prisma, PrismaClient } from "@prisma/client";

import { buildMockDatabase } from "./seed-data";

const prisma = new PrismaClient();

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(value: unknown) {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

async function main() {
  const db = buildMockDatabase();

  await prisma.$transaction([
    prisma.trendRun.deleteMany(),
    prisma.savedTrend.deleteMany(),
    prisma.bet.deleteMany(),
    prisma.injury.deleteMany(),
    prisma.playerGameStat.deleteMany(),
    prisma.teamGameStat.deleteMany(),
    prisma.marketSnapshot.deleteMany(),
    prisma.market.deleteMany(),
    prisma.game.deleteMany(),
    prisma.player.deleteMany(),
    prisma.team.deleteMany(),
    prisma.sportsbook.deleteMany(),
    prisma.league.deleteMany(),
    prisma.user.deleteMany()
  ]);

  await prisma.league.createMany({ data: db.leagues });
  await prisma.sportsbook.createMany({ data: db.sportsbooks });
  await prisma.team.createMany({
    data: db.teams.map((team) => ({
      ...team,
      externalIds: toJsonInput(team.externalIds)
    }))
  });
  await prisma.player.createMany({
    data: db.players.map((player) => ({
      ...player,
      externalIds: toJsonInput(player.externalIds)
    }))
  });
  await prisma.game.createMany({
    data: db.games.map((game) => ({
      ...game,
      scoreJson: toNullableJsonInput(game.scoreJson),
      liveStateJson: toNullableJsonInput(game.liveStateJson)
    }))
  });
  await prisma.market.createMany({ data: db.markets });
  await prisma.marketSnapshot.createMany({ data: db.marketSnapshots });
  await prisma.teamGameStat.createMany({
    data: db.teamGameStats.map((entry) => ({
      ...entry,
      statsJson: toJsonInput(entry.statsJson)
    }))
  });
  await prisma.playerGameStat.createMany({
    data: db.playerGameStats.map((entry) => ({
      ...entry,
      statsJson: toJsonInput(entry.statsJson)
    }))
  });
  await prisma.injury.createMany({ data: db.injuries });
  await prisma.user.createMany({
    data: db.users.map((user) => ({
      ...user,
      bankrollSettingsJson: toNullableJsonInput(user.bankrollSettingsJson)
    }))
  });
  await prisma.bet.createMany({
    data: db.bets.map((bet) => ({
      ...bet,
      tagsJson: toNullableJsonInput(bet.tagsJson)
    }))
  });
  await prisma.savedTrend.createMany({
    data: db.savedTrends.map((trend) => ({
      ...trend,
      queryJson: toJsonInput(trend.queryJson)
    }))
  });
  await prisma.trendRun.createMany({
    data: db.trendRuns.map((run) => ({
      ...run,
      queryJson: toJsonInput(run.queryJson),
      resultJson: toJsonInput(run.resultJson)
    }))
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
