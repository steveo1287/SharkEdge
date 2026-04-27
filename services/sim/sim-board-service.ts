import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";

type SimRecommendation = "ATTACK" | "WATCH" | "BUILDING" | "PASS";
type SimConfidenceBand = "HIGH" | "MEDIUM" | "LOW";
type SimSetupStatus = "ready" | "blocked" | "degraded";

export type SimBoardFeed = {
  generatedAt: string;
  summary: {
    totalEvents: number;
    projectedEvents: number;
    signalEvents: number;
    marketReadyEvents: number;
    attackableEvents: number;
  };
  events: Array<{
    id: string;
    eventKey: string | null;
    league: string;
    name: string;
    startTime: string;
    status: string;
    participants: Array<{
      role: string;
      competitor: string;
    }>;
    projection: unknown;
    markets: unknown[];
    topSignals: Array<{
      edgeScore: number | null;
      evPercent: number | null;
      selectionCompetitor: unknown;
      player: unknown;
      sportsbook: unknown;
      marketType: string;
      side: string | null;
    }>;
    diagnostics: {
      hasProjection: boolean;
      signalCount: number;
      bestEdgeScore: number | null;
      bestEvPercent: number | null;
      marketCount: number;
      smartScore: number;
      confidenceBand: SimConfidenceBand;
      recommendation: SimRecommendation;
    };
  }>;
  setup: {
    status: SimSetupStatus;
    title: string;
    detail: string | null;
    steps: string[];
  };
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readWindowHours(envKey: string, fallback: number) {
  const raw = process.env[envKey];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
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

export async function getSimBoardFeed(leagueKey?: string): Promise<SimBoardFeed> {
  const lookbackHours = readWindowHours("SIM_BOARD_LOOKBACK_HOURS", 36);
  const lookaheadHours = readWindowHours("SIM_BOARD_LOOKAHEAD_HOURS", 72);

  if (!hasUsableServerDatabaseUrl()) {
    const resolution = getServerDatabaseResolution();
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalEvents: 0,
        projectedEvents: 0,
        signalEvents: 0,
        marketReadyEvents: 0,
        attackableEvents: 0
      },
      events: [],
      setup: {
        status: "blocked",
        title: "Simulator needs a database connection",
        detail: "Simulation cards load from event, projection, market-state, and signal tables.",
        steps: [
          "Set DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL in the runtime.",
          "Run npx prisma migrate deploy.",
          `Active DB source: ${resolution.key ?? "none"}.`
        ]
      }
    };
  }

  let events;
  try {
    events = await prisma.event.findMany({
      where: {
        ...(leagueKey ? { league: { key: leagueKey } } : {}),
        startTime: {
          gte: new Date(Date.now() - 1000 * 60 * 60 * lookbackHours),
          lte: new Date(Date.now() + 1000 * 60 * 60 * lookaheadHours)
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sim-board] failed to load simulator events", { leagueKey, message });

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalEvents: 0,
        projectedEvents: 0,
        signalEvents: 0,
        marketReadyEvents: 0,
        attackableEvents: 0
      },
      events: [],
      setup: {
        status: "degraded",
        title: "Simulator is temporarily degraded",
        detail: "The simulator query failed. Board cards are hidden until this query path recovers.",
        steps: [
          "Verify simulator tables and columns are migrated in the active database.",
          "Check Prisma logs for the exact relation/column failure.",
          `Latest error: ${message}`
        ]
      }
    };
  }

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
    events: mappedEvents.map(({ sortScore, ...event }) => event),
    setup: {
        status: "ready",
        title: "Simulator ready",
        detail: null,
        steps: []
    }
  };
}
