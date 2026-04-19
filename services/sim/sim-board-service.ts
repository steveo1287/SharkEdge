import { prisma } from "@/lib/db/prisma";

export async function getSimBoardFeed(leagueKey?: string) {
  const events = await prisma.event.findMany({
    where: {
      startTime: {
        gte: new Date(Date.now() - 1000 * 60 * 60 * 12),
        lte: new Date(Date.now() + 1000 * 60 * 60 * 48)
      }
    },
    select: {
      id: true,
      externalEventId: true,
      leagueId: true,
      name: true,
      startTime: true,
      status: true
    },
    orderBy: { startTime: "asc" }
  });

  const eventIds = events.map((e) => e.id);
  const [participants, currentMarketStates, eventProjections, edgeSignals] = await Promise.all([
    prisma.eventParticipant.findMany({
      where: { eventId: { in: eventIds } },
      include: { competitor: true }
    }),
    prisma.currentMarketState.findMany({
      where: { eventId: { in: eventIds } },
      include: {
        selectionCompetitor: true,
        player: true,
        bestHomeBook: true,
        bestAwayBook: true,
        bestOverBook: true,
        bestUnderBook: true
      }
    }),
    prisma.eventProjection.findMany({
      where: { eventId: { in: eventIds } }
    }),
    prisma.edgeSignal.findMany({
      where: { eventId: { in: eventIds }, isActive: true },
      include: {
        selectionCompetitor: true,
        player: true,
        sportsbook: true
      },
      orderBy: [{ edgeScore: "desc" }, { evPercent: "desc" }]
    })
  ]);

  const participantsByEventId = new Map<string, typeof participants>();
  for (const p of participants) {
    const list = participantsByEventId.get(p.eventId) ?? [];
    list.push(p);
    participantsByEventId.set(p.eventId, list);
  }

  const currentMarketStatesByEventId = new Map<string, typeof currentMarketStates>();
  for (const cms of currentMarketStates) {
    const list = currentMarketStatesByEventId.get(cms.eventId) ?? [];
    list.push(cms);
    currentMarketStatesByEventId.set(cms.eventId, list);
  }

  const eventProjectionsByEventId = new Map<string, typeof eventProjections>();
  for (const ep of eventProjections) {
    const list = eventProjectionsByEventId.get(ep.eventId) ?? [];
    list.push(ep);
    eventProjectionsByEventId.set(ep.eventId, list);
  }

  const edgeSignalsByEventId = new Map<string, typeof edgeSignals>();
  for (const es of edgeSignals) {
    const list = edgeSignalsByEventId.get(es.eventId) ?? [];
    list.push(es);
    edgeSignalsByEventId.set(es.eventId, list);
  }

  return {
    generatedAt: new Date().toISOString(),
    events: events.map((event) => {
      const eventParticipants = participantsByEventId.get(event.id) ?? [];
      const cms = currentMarketStatesByEventId.get(event.id) ?? [];
      const ep = eventProjectionsByEventId.get(event.id) ?? [];
      const es = edgeSignalsByEventId.get(event.id) ?? [];
      return {
        id: event.id,
        eventKey: event.externalEventId,
        league: event.leagueId,
        name: event.name,
        startTime: event.startTime.toISOString(),
        status: event.status,
        participants: eventParticipants.map((participant: any) => ({
          role: participant.role,
          competitor: participant.competitor.name
        })),
        projection: ep[0] ?? null,
        markets: cms,
        topSignals: es.slice(0, 5)
      };
    })
  };
}
