import { prisma } from "@/lib/db/prisma";

type SimRecommendation = "ATTACK" | "WATCH" | "BUILDING" | "PASS";
type SimConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getConfidenceBand(score: number): SimConfidenceBand {
  if (score >= 75) return "HIGH";
  if (score >= 45) return "MEDIUM";
  return "LOW";
}

function getRecommendation(args: {
  hasProjection: boolean;
  marketCount: number;
  signalCount: number;
  bestEdgeScore: number | null;
  bestEvPercent: number | null;
}): SimRecommendation {
  if (!args.hasProjection && args.marketCount === 0 && args.signalCount === 0) {
    return "PASS";
  }

  if (
    args.hasProjection &&
    args.marketCount >= 3 &&
    args.signalCount >= 2 &&
    (args.bestEdgeScore ?? 0) >= 60 &&
    (args.bestEvPercent ?? 0) >= 0.03
  ) {
    return "ATTACK";
  }

  if (
    args.hasProjection &&
    args.marketCount >= 1 &&
    ((args.bestEdgeScore ?? 0) >= 45 || (args.bestEvPercent ?? 0) >= 0.015)
  ) {
    return "WATCH";
  }

  return "BUILDING";
}

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
      const marketCount = event.currentMarketStates.length;
      const signalCount = topSignals.length;

      const smartScore = clamp(
        (hasProjection ? 35 : 0) +
          clamp(marketCount * 7, 0, 21) +
          clamp(signalCount * 6, 0, 24) +
          clamp((bestEdgeScore ?? 0) * 0.35, 0, 28) +
          clamp((bestEvPercent ?? 0) * 400, 0, 20),
        0,
        100
      );

      const confidenceBand = getConfidenceBand(smartScore);
      const recommendation = getRecommendation({
        hasProjection,
        marketCount,
        signalCount,
        bestEdgeScore,
        bestEvPercent
      });

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
          signalCount,
          bestEdgeScore,
          bestEvPercent,
          marketCount,
          smartScore,
          confidenceBand,
          recommendation
        },
        sortScore: smartScore
      };
    })
    .sort((a, b) => b.sortScore - a.sortScore || a.startTime.localeCompare(b.startTime));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalEvents: mappedEvents.length,
      projectedEvents: mappedEvents.filter((event) => event.diagnostics.hasProjection).length,
      signalEvents: mappedEvents.filter((event) => event.diagnostics.signalCount > 0).length,
      marketReadyEvents: mappedEvents.filter((event) => event.diagnostics.marketCount > 0).length,
      attackableEvents: mappedEvents.filter((event) => event.diagnostics.recommendation === "ATTACK").length
    },
    events: mappedEvents.map(({ sortScore, ...event }) => event)
  };
}
