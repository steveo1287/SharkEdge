import { prisma } from "@/lib/db/prisma";

export async function getSimBoardFeed(leagueKey?: string) {
  const events = await prisma.event.findMany({
    where: {
      ...(leagueKey ? { league: { key: leagueKey } } : {}),
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 12),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 48)
      }
    },
    include: {
      league: true,
      participants: { include: { competitor: true } },
      currentMarketStates: {
        include: {
          selectionCompetitor: true,
          player: true,
          bestHomeBook: true,
          bestAwayBook: true,
          bestOverBook: true,
          bestUnderBook: true
        } as any
      },
      eventProjections: {
        orderBy: {
          modelRun: {
            createdAt: "desc"
          }
        },
        take: 1
      },
      edgeSignals: {
        where: { isActive: true },
        include: {
          selectionCompetitor: true,
          player: true,
          sportsbook: true
        } as any,
        orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }],
        take: 5
      }
    },
    orderBy: { startTime: "asc" }
  });

  return {
    generatedAt: new Date().toISOString(),
    events: events.map((event) => ({
      id: event.id,
      eventKey: event.externalEventId,
      league: event.league.key,
      name: event.name,
      startTime: event.startTime.toISOString(),
      status: event.status,
      participants: event.participants.map((participant) => ({
        role: participant.role,
        competitor: participant.competitor.name
      })),
      projection: event.eventProjections[0] ?? null,
      markets: event.currentMarketStates,
      topSignals: event.edgeSignals.map((signal) => ({
        edgeScore: signal.edgeScore ?? null,
        evPercent: signal.evPercent ?? null,
        selectionCompetitor: signal.selectionCompetitor as any,
        player: signal.player as any,
        sportsbook: signal.sportsbook as any,
        marketType: String(signal.marketType),
        side: signal.side
      }))
    }))
  };
}
