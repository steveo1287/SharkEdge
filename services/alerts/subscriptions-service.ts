import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function listAlertSubscriptions() {
  const rows = await prisma.alertSubscription.findMany({
    include: {
      sport: true,
      league: true,
      player: true,
      team: true
    },
    orderBy: { createdAt: "desc" }
  });

  return {
    count: rows.length,
    data: rows
  };
}

export async function createAlertSubscription(input: {
  userId: string;
  sportId?: string;
  leagueId?: string;
  marketType?: import("@prisma/client").MarketType;
  minEvPercent?: number;
  minConfidenceScore?: number;
  playerId?: string;
  teamId?: string;
  metadataJson?: Record<string, unknown>;
}) {
  return prisma.alertSubscription.create({
    data: {
      userId: input.userId,
      sportId: input.sportId,
      leagueId: input.leagueId,
      marketType: input.marketType,
      minEvPercent: input.minEvPercent,
      minConfidenceScore: input.minConfidenceScore,
      playerId: input.playerId,
      teamId: input.teamId,
      metadataJson: (input.metadataJson ?? {}) as Prisma.InputJsonValue
    }
  });
}
