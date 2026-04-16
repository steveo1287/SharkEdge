import { prisma } from "@/lib/db/prisma";

type EventContextRefreshArgs = {
  leagues?: string[];
  days?: number;
};

type Appearance = {
  eventId: string;
  opponentId: string | null;
  startTime: Date;
  role: "HOME" | "AWAY" | "COMPETITOR_A" | "COMPETITOR_B" | "UNKNOWN";
  won: boolean | null;
  margin: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function dayDiff(current: Date, previous: Date) {
  return (current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000);
}

function getWindowStart(days?: number) {
  if (!days || !Number.isFinite(days) || days <= 0) {
    return null;
  }

  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function getOpponentId(
  participantId: string,
  participants: Array<{
    competitorId: string;
  }>
) {
  return participants.find((participant) => participant.competitorId !== participantId)?.competitorId ?? null;
}

function computeSiteStreak(history: Appearance[], role: Appearance["role"]) {
  let streak = 0;
  for (const appearance of [...history].reverse()) {
    if (appearance.role !== role) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function computeRecentWinRate(history: Appearance[]) {
  const recent = history.slice(-5).filter((appearance) => typeof appearance.won === "boolean");
  if (!recent.length) {
    return null;
  }
  return Number((((recent.filter((appearance) => appearance.won).length / recent.length) * 100)).toFixed(1));
}

function computeRecentMargin(history: Appearance[]) {
  const margins = history
    .slice(-5)
    .map((appearance) => appearance.margin)
    .filter((value): value is number => typeof value === "number");
  return margins.length ? Number((average(margins) ?? 0).toFixed(2)) : null;
}

function computeGamesWithin(history: Appearance[], current: Date, days: number) {
  return history.filter((appearance) => dayDiff(current, appearance.startTime) <= days).length;
}

function buildScheduleDensityScore(args: {
  gamesLast7: number;
  gamesLast14: number;
  isBackToBack: boolean;
}) {
  return Number(
    clamp(args.gamesLast7 * 15 + args.gamesLast14 * 4 + (args.isBackToBack ? 18 : 0), 0, 100).toFixed(1)
  );
}

function buildTravelProxyScore(args: {
  previousRole: Appearance["role"] | null;
  currentRole: Appearance["role"];
  isBackToBack: boolean;
  gamesLast7: number;
  siteStreak: number;
}) {
  const roleSwitch =
    args.previousRole && args.previousRole !== args.currentRole ? 28 : 0;
  const awayLoad = args.currentRole === "AWAY" ? 14 : 0;
  const sameSiteRelief = args.siteStreak >= 2 ? -12 : 0;
  return Number(
    clamp(
      roleSwitch + awayLoad + (args.isBackToBack ? 25 : 0) + Math.max(args.gamesLast7 - 2, 0) * 9 + sameSiteRelief,
      0,
      100
    ).toFixed(1)
  );
}

export async function refreshEventParticipantContextWarehouse(args?: EventContextRefreshArgs) {
  const leagues = args?.leagues?.length ? args.leagues : ["NBA", "NCAAB", "MLB", "NHL", "NFL", "NCAAF"];
  const windowStart = getWindowStart(args?.days);

  const events = await prisma.event.findMany({
    where: {
      league: {
        key: {
          in: leagues
        }
      },
      ...(windowStart ? { startTime: { gte: windowStart } } : {})
    },
    include: {
      participants: {
        orderBy: {
          sortOrder: "asc"
        }
      },
      eventResult: {
        select: {
          winnerCompetitorId: true,
          margin: true
        }
      }
    },
    orderBy: [{ startTime: "asc" }, { createdAt: "asc" }]
  });

  const historyByCompetitor = new Map<string, Appearance[]>();
  let contextCount = 0;

  for (const event of events) {
    const pendingContexts = event.participants.map((participant) => {
      const history = historyByCompetitor.get(participant.competitorId) ?? [];
      const previousAppearance = history.at(-1) ?? null;
      const opponentId = getOpponentId(participant.competitorId, event.participants);
      const previousVsOpponent = [...history].reverse().find((appearance) => appearance.opponentId === opponentId) ?? null;
      const daysRest =
        previousAppearance ? Number(dayDiff(event.startTime, previousAppearance.startTime).toFixed(2)) : null;
      const isBackToBack = typeof daysRest === "number" ? daysRest <= 1.25 : false;
      const gamesLast7 = computeGamesWithin(history, event.startTime, 7);
      const gamesLast14 = computeGamesWithin(history, event.startTime, 14);
      const siteStreak = computeSiteStreak(history, participant.role);
      const recentWinRate = computeRecentWinRate(history);
      const recentMargin = computeRecentMargin(history);
      const isRematch = Boolean(
        previousVsOpponent && dayDiff(event.startTime, previousVsOpponent.startTime) <= 30
      );
      const revengeSpot = Boolean(previousVsOpponent && previousVsOpponent.won === false);

      return {
        eventId: event.id,
        competitorId: participant.competitorId,
        role: participant.role,
        previousEventId: previousAppearance?.eventId ?? null,
        previousOpponentId: previousAppearance?.opponentId ?? null,
        daysRest,
        gamesLast7,
        gamesLast14,
        isBackToBack,
        siteStreak,
        isRematch,
        revengeSpot,
        recentWinRate,
        recentMargin,
        scheduleDensityScore: buildScheduleDensityScore({
          gamesLast7,
          gamesLast14,
          isBackToBack
        }),
        travelProxyScore: buildTravelProxyScore({
          previousRole: previousAppearance?.role ?? null,
          currentRole: participant.role,
          isBackToBack,
          gamesLast7,
          siteStreak
        }),
        metadataJson: {
          derivedFrom: "historical_event_sequence",
          assumptions: {
            travelProxy: "Role-switch + cadence proxy, not geographic mileage.",
            revengeWindowDays: 30
          }
        }
      };
    });

    const contextByCompetitor = new Map(
      pendingContexts.map((context) => [context.competitorId, context] as const)
    );
    const finalizedContexts = pendingContexts.map((context) => {
      const opponentContext = event.participants
        .filter((participant) => participant.competitorId !== context.competitorId)
        .map((participant) => contextByCompetitor.get(participant.competitorId))
        .find(Boolean);
      const opponentRestDays = opponentContext?.daysRest ?? null;
      const restAdvantageDays =
        typeof context.daysRest === "number" && typeof opponentRestDays === "number"
          ? Number((context.daysRest - opponentRestDays).toFixed(2))
          : null;

      return {
        ...context,
        opponentRestDays,
        restAdvantageDays
      };
    });

    for (const context of finalizedContexts) {
      await prisma.eventParticipantContext.upsert({
        where: {
          eventId_competitorId: {
            eventId: context.eventId,
            competitorId: context.competitorId
          }
        },
        update: {
          role: context.role,
          previousEventId: context.previousEventId,
          previousOpponentId: context.previousOpponentId,
          daysRest: context.daysRest,
          opponentRestDays: context.opponentRestDays,
          restAdvantageDays: context.restAdvantageDays,
          gamesLast7: context.gamesLast7,
          gamesLast14: context.gamesLast14,
          isBackToBack: context.isBackToBack,
          siteStreak: context.siteStreak,
          isRematch: context.isRematch,
          revengeSpot: context.revengeSpot,
          recentWinRate: context.recentWinRate,
          recentMargin: context.recentMargin,
          scheduleDensityScore: context.scheduleDensityScore,
          travelProxyScore: context.travelProxyScore,
          metadataJson: context.metadataJson
        },
        create: context
      });
      contextCount += 1;
    }

    for (const participant of event.participants) {
      const opponentId = getOpponentId(participant.competitorId, event.participants);
      const won =
        event.eventResult?.winnerCompetitorId
          ? event.eventResult.winnerCompetitorId === participant.competitorId
          : null;
      const margin =
        typeof event.eventResult?.margin === "number"
          ? won === null
            ? null
            : won
              ? event.eventResult.margin
              : -event.eventResult.margin
          : null;

      const history = historyByCompetitor.get(participant.competitorId) ?? [];
      history.push({
        eventId: event.id,
        opponentId,
        startTime: event.startTime,
        role: participant.role,
        won,
        margin
      });
      historyByCompetitor.set(participant.competitorId, history);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    leagues,
    contextCount
  };
}
