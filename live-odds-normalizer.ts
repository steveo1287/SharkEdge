import { prisma } from "@/lib/db/prisma";

function normalizeAlias(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function resolveEntitiesJob() {
  const teams = await prisma.team.findMany();
  for (const team of teams) {
    await prisma.teamAlias.upsert({
      where: {
        source_normalizedAlias: {
          source: "canonical",
          normalizedAlias: normalizeAlias(team.name)
        }
      },
      update: { alias: team.name, teamId: team.id },
      create: {
        teamId: team.id,
        source: "canonical",
        alias: team.name,
        normalizedAlias: normalizeAlias(team.name)
      }
    });
  }

  const players = await prisma.player.findMany();
  for (const player of players) {
    await prisma.playerAlias.upsert({
      where: {
        source_normalizedAlias: {
          source: "canonical",
          normalizedAlias: normalizeAlias(player.name)
        }
      },
      update: { alias: player.name, playerId: player.id },
      create: {
        playerId: player.id,
        source: "canonical",
        alias: player.name,
        normalizedAlias: normalizeAlias(player.name)
      }
    });
  }

  return {
    teams: teams.length,
    players: players.length
  };
}
