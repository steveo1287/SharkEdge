import { Prisma, PrismaClient } from "@prisma/client";

import { buildCoreSeedData } from "./seed-core";
import { buildMockDatabase } from "./seed-data";

const prisma = new PrismaClient();

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function toNullableJsonInput(value: unknown) {
  return value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);
}

function getSportIdForLeague(key: string) {
  switch (key) {
    case "NBA":
      return "sport_basketball";
    case "MLB":
      return "sport_baseball";
    case "NHL":
      return "sport_hockey";
    case "NFL":
    case "NCAAF":
      return "sport_football";
    case "UFC":
      return "sport_mma";
    case "BOXING":
      return "sport_boxing";
    default:
      return null;
  }
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

async function main() {
  const db = buildMockDatabase();
  const core = buildCoreSeedData();

  await prisma.$transaction([
    prisma.importRow.deleteMany(),
    prisma.importBatch.deleteMany(),
    prisma.alertNotification.deleteMany(),
    prisma.alertRule.deleteMany(),
    prisma.watchlistItem.deleteMany(),
    prisma.trendRun.deleteMany(),
    prisma.savedTrend.deleteMany(),
    prisma.betLeg.deleteMany(),
    prisma.bet.deleteMany(),
    prisma.injury.deleteMany(),
    prisma.playerGameStat.deleteMany(),
    prisma.teamGameStat.deleteMany(),
    prisma.eventMarketSnapshot.deleteMany(),
    prisma.eventMarket.deleteMany(),
    prisma.marketSnapshot.deleteMany(),
    prisma.market.deleteMany(),
    prisma.eventParticipant.deleteMany(),
    prisma.eventResult.deleteMany(),
    prisma.event.deleteMany(),
    prisma.competitor.deleteMany(),
    prisma.game.deleteMany(),
    prisma.player.deleteMany(),
    prisma.team.deleteMany(),
    prisma.sportsbook.deleteMany(),
    prisma.league.deleteMany(),
    prisma.sport.deleteMany(),
    prisma.user.deleteMany()
  ]);

  await prisma.sport.createMany({
    data: [...core.sports] as Prisma.SportCreateManyInput[]
  });

  await prisma.league.createMany({
    data: dedupeById([
      ...db.leagues.map((league) => ({
        ...league,
        sportId: getSportIdForLeague(league.key)
      })),
      ...core.leagues
    ]) as Prisma.LeagueCreateManyInput[]
  });

  await prisma.sportsbook.createMany({
    data: db.sportsbooks.map((book) => ({
      ...book,
      logoUrl: null,
      isActive: true
    })) as Prisma.SportsbookCreateManyInput[]
  });

  await prisma.team.createMany({
    data: db.teams.map((team) => ({
      ...team,
      externalIds: toJsonInput(team.externalIds)
    })) as Prisma.TeamCreateManyInput[]
  });

  await prisma.player.createMany({
    data: db.players.map((player) => ({
      ...player,
      externalIds: toJsonInput(player.externalIds)
    })) as Prisma.PlayerCreateManyInput[]
  });

  await prisma.game.createMany({
    data: db.games.map((game) => ({
      ...game,
      scoreJson: toNullableJsonInput(game.scoreJson),
      liveStateJson: toNullableJsonInput(game.liveStateJson)
    })) as Prisma.GameCreateManyInput[]
  });

  await prisma.market.createMany({ data: db.markets });
  await prisma.marketSnapshot.createMany({ data: db.marketSnapshots });

  await prisma.teamGameStat.createMany({
    data: db.teamGameStats.map((entry) => ({
      ...entry,
      statsJson: toJsonInput(entry.statsJson)
    })) as Prisma.TeamGameStatCreateManyInput[]
  });

  await prisma.playerGameStat.createMany({
    data: db.playerGameStats.map((entry) => ({
      ...entry,
      statsJson: toJsonInput(entry.statsJson)
    })) as Prisma.PlayerGameStatCreateManyInput[]
  });

  await prisma.injury.createMany({ data: db.injuries });

  await prisma.competitor.createMany({
    data: [...core.competitors].map((competitor) => ({
      ...competitor,
      externalIds: toNullableJsonInput(competitor.externalIds),
      metadataJson: toNullableJsonInput(competitor.metadataJson)
    })) as Prisma.CompetitorCreateManyInput[]
  });

  await prisma.event.createMany({
    data: [...core.events].map((event) => ({
      ...event,
      scoreJson: toNullableJsonInput(event.scoreJson),
      stateJson: toNullableJsonInput(event.stateJson),
      resultJson: toNullableJsonInput(event.resultJson),
      metadataJson: toNullableJsonInput(event.metadataJson)
    })) as Prisma.EventCreateManyInput[]
  });

  await prisma.eventParticipant.createMany({
    data: [...core.eventParticipants].map((participant) => ({
      ...participant,
      metadataJson: toNullableJsonInput(participant.metadataJson)
    })) as Prisma.EventParticipantCreateManyInput[]
  });

  if (core.eventResults.length) {
    await prisma.eventResult.createMany({
      data: [...core.eventResults].map((eventResult) => ({
        ...eventResult,
        participantResultsJson: toJsonInput(eventResult.participantResultsJson),
        metadataJson: toNullableJsonInput(eventResult.metadataJson)
      })) as Prisma.EventResultCreateManyInput[]
    });
  }

  await prisma.user.createMany({
    data: db.users.map((user) => ({
      ...user,
      bankrollSettingsJson: toNullableJsonInput(user.bankrollSettingsJson),
      planTier: "FREE",
      subscriptionState: "NONE",
      notificationPrefsJson: toJsonInput({
        deliveryChannels: ["IN_APP"],
        quietHours: {
          enabled: false,
          startHour: 23,
          endHour: 7
        },
        sportPreferences: {
          NBA: true,
          MLB: true,
          NHL: true,
          NFL: true,
          NCAAF: true,
          UFC: true,
          BOXING: true
        },
        alertTypePreferences: {
          LINE_MOVEMENT_THRESHOLD: true,
          EV_THRESHOLD_REACHED: true,
          BEST_BOOK_CHANGED: true,
          STARTING_SOON: true,
          AVAILABILITY_RETURNED: true,
          TARGET_NUMBER_CROSSED: true,
          PROP_LINE_CHANGED: true,
          CLV_TREND: true
        }
      })
    })) as Prisma.UserCreateManyInput[]
  });

  await prisma.savedTrend.createMany({
    data: db.savedTrends.map((trend) => ({
      ...trend,
      queryJson: toJsonInput(trend.queryJson)
    })) as Prisma.SavedTrendCreateManyInput[]
  });

  await prisma.trendRun.createMany({
    data: db.trendRuns.map((run) => ({
      ...run,
      queryJson: toJsonInput(run.queryJson),
      resultJson: toJsonInput(run.resultJson)
    })) as Prisma.TrendRunCreateManyInput[]
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
