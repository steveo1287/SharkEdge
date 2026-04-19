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

  const mappedEvents = events
    .map((event) => {
      const projection = event.eventProjections[0] ?? null;
      const topSignals = event.edgeSignals.map((signal) => ({
        edgeScore: signal.edgeScore ?? null,
        evPercent: signal.evPercent ?? null,
        selectionCompetitor: signal.selectionCompetitor as any,
        player: signal.player as any,
        sportsbook: signal.sportsbook as any,
        marketType: String(signal.marketType),
        side: signal.side
      }));

      const numericEdgeScores = topSignals
        .map((signal) => signal.edgeScore)
        .filter((value): value is number => typeof value === "number");
      const numericEvPercents = topSignals
        .map((signal) => signal.evPercent)
        .filter((value): value is number => typeof value === "number");

      const bestEdgeScore = numericEdgeScores.length > 0 ? Math.max(...numericEdgeScores) : null;
      const bestEvPercent = numericEvPercents.length > 0 ? Math.max(...numericEvPercents) : null;
      const hasProjection = projection !== null;
      const sortScore =
        (hasProjection ? 1000 : 0) +
        (bestEdgeScore ?? 0) * 10 +
        (bestEvPercent ?? 0) * 100 +
        topSignals.length;

      return {
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
        projection,
        markets: event.currentMarketStates,
        topSignals,
        diagnostics: {
          hasProjection,
          signalCount: topSignals.length,
          bestEdgeScore,
          bestEvPercent,
          marketCount: event.currentMarketStates.length
        },
        sortScore
      };
    })
    .sort((a, b) => b.sortScore - a.sortScore || a.startTime.localeCompare(b.startTime));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: mappedEvents.length,
      projectedEvents: mappedEvents.filter((event) => event.diagnostics.hasProjection).length,
      signalEvents: mappedEvents.filter((event) => event.diagnostics.signalCount > 0).length,
      marketReadyEvents: mappedEvents.filter((event) => event.diagnostics.marketCount > 0).length
    },
    events: mappedEvents.map(({ sortScore, ...event }) => event)
  };
}
