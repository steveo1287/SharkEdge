import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { americanToImplied } from "@/lib/odds";
import { deriveCoverResult, deriveOuResult } from "@/services/events/result-normalization";

const HISTORICAL_SOURCE_KEY = "oddsharvester_historical" as const;

function normalizeToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildNameTokens(value: string | null | undefined) {
  const raw = value ?? "";
  const parts = raw
    .split(/\s+/)
    .map((part) => normalizeToken(part))
    .filter(Boolean);

  return Array.from(new Set([normalizeToken(raw), ...parts, parts.at(-1) ?? ""])).filter(Boolean);
}

function resolveHistoricalSelectionCompetitorId(args: {
  marketType: string;
  selection: string;
  side: string | null;
  participants: Array<{
    competitorId: string;
    role: string;
    competitor: {
      name: string;
      abbreviation: string | null;
    };
  }>;
}) {
  if (args.marketType === "total" || args.side === "OVER" || args.side === "UNDER") {
    return null;
  }

  if (args.side === "HOME" || args.side === "AWAY" || args.side === "COMPETITOR_A" || args.side === "COMPETITOR_B") {
    const matchedByRole = args.participants.find((participant) => participant.role === args.side);
    if (matchedByRole) {
      return matchedByRole.competitorId;
    }
  }

  const selectionTokens = buildNameTokens(args.selection);
  const matchedByName = args.participants.find((participant) => {
    const participantTokens = buildNameTokens(participant.competitor.name);
    const abbreviationToken = normalizeToken(participant.competitor.abbreviation);
    return (
      selectionTokens.some((token) => participantTokens.includes(token)) ||
      (abbreviationToken && selectionTokens.includes(abbreviationToken))
    );
  });

  return matchedByName?.competitorId ?? null;
}

async function refreshMarketAnchors(
  tx: Prisma.TransactionClient,
  eventMarketId: string
) {
  const snapshots = await tx.eventMarketSnapshot.findMany({
    where: {
      eventMarketId
    },
    orderBy: {
      capturedAt: "asc"
    },
    select: {
      line: true,
      oddsAmerican: true
    }
  });

  const opening = snapshots[0] ?? null;
  const latest = snapshots.at(-1) ?? null;

  if (!opening || !latest) {
    return false;
  }

  await tx.eventMarket.update({
    where: {
      id: eventMarketId
    },
    data: {
      openingLine: opening.line ?? null,
      currentLine: latest.line ?? null,
      closingLine: latest.line ?? null,
      openingOdds: opening.oddsAmerican,
      currentOdds: latest.oddsAmerican,
      closingOdds: latest.oddsAmerican
    }
  });

  return true;
}

async function refreshEventOutcomeSummary(
  tx: Prisma.TransactionClient,
  eventId: string
) {
  const event = await tx.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      participants: {
        include: {
          competitor: {
            select: {
              id: true,
              name: true,
              abbreviation: true
            }
          }
        }
      },
      eventResult: true,
      markets: {
        where: {
          marketType: {
            in: ["spread", "total"]
          }
        },
        select: {
          id: true,
          marketType: true,
          side: true,
          line: true,
          selectionCompetitorId: true
        }
      }
    }
  });

  if (!event?.eventResult) {
    return false;
  }

  const participantResults =
    event.eventResult.participantResultsJson &&
    typeof event.eventResult.participantResultsJson === "object"
      ? (event.eventResult.participantResultsJson as Record<string, { score?: number | null }>)
      : {};

  const homeParticipant = event.participants.find((participant) => participant.role === "HOME") ?? null;
  const awayParticipant = event.participants.find((participant) => participant.role === "AWAY") ?? null;
  const coverResult = deriveCoverResult({
    markets: event.markets,
    homeCompetitorId: homeParticipant?.competitorId ?? null,
    awayCompetitorId: awayParticipant?.competitorId ?? null,
    homeScore: participantResults.home?.score ?? null,
    awayScore: participantResults.away?.score ?? null
  });
  const ouResult = deriveOuResult({
    markets: event.markets,
    totalPoints: event.eventResult.totalPoints
  });

  await tx.eventResult.update({
    where: {
      eventId
    },
    data: {
      coverResult: coverResult ?? Prisma.JsonNull,
      ouResult
    }
  });

  return true;
}

export async function backfillHistoricalIntelligence(args?: {
  leagueKey?: string;
  limit?: number;
}) {
  const markets = await prisma.eventMarket.findMany({
    where: {
      sourceKey: HISTORICAL_SOURCE_KEY,
      ...(args?.leagueKey
        ? {
            event: {
              league: {
                key: args.leagueKey
              }
            }
          }
        : {})
    },
    include: {
      event: {
        include: {
          participants: {
            include: {
              competitor: {
                select: {
                  name: true,
                  abbreviation: true
                }
              }
            }
          },
          eventResult: true
        }
      },
      snapshots: {
        select: {
          line: true,
          oddsAmerican: true,
          capturedAt: true
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: args?.limit ?? 2500
  });

  let marketAnchorsRefreshed = 0;
  let competitorMappingsUpdated = 0;
  const touchedEvents = new Set<string>();

  for (const market of markets) {
    await prisma.$transaction(async (tx) => {
      const nextSelectionCompetitorId = resolveHistoricalSelectionCompetitorId({
        marketType: market.marketType,
        selection: market.selection,
        side: market.side,
        participants: market.event.participants.map((participant) => ({
          competitorId: participant.competitorId,
          role: participant.role,
          competitor: participant.competitor
        }))
      });
      const impliedProbability =
        market.impliedProbability ??
        (typeof market.oddsAmerican === "number" ? americanToImplied(market.oddsAmerican) : null);
      const updateData: Prisma.EventMarketUncheckedUpdateInput = {
        impliedProbability,
        selectionCompetitorId: nextSelectionCompetitorId,
        currentLine: market.currentLine ?? market.line ?? market.snapshots.at(-1)?.line ?? null,
        currentOdds:
          market.currentOdds ??
          market.oddsAmerican ??
          market.snapshots.at(-1)?.oddsAmerican ??
          null
      };

      const changedSelectionCompetitorId =
        (market.selectionCompetitorId ?? null) !== (nextSelectionCompetitorId ?? null);

      await tx.eventMarket.update({
        where: {
          id: market.id
        },
        data: updateData
      });

      if (changedSelectionCompetitorId) {
        competitorMappingsUpdated += 1;
      }

      const refreshedAnchors = await refreshMarketAnchors(tx, market.id);
      if (refreshedAnchors) {
        marketAnchorsRefreshed += 1;
      }
    });

    if (market.event.eventResult) {
      touchedEvents.add(market.eventId);
    }
  }

  let eventResultsRefreshed = 0;
  for (const eventId of touchedEvents) {
    const updated = await prisma.$transaction((tx) => refreshEventOutcomeSummary(tx, eventId));
    if (updated) {
      eventResultsRefreshed += 1;
    }
  }

  return {
    sourceKey: HISTORICAL_SOURCE_KEY,
    marketCount: markets.length,
    marketAnchorsRefreshed,
    competitorMappingsUpdated,
    eventResultsRefreshed,
    leagueKey: args?.leagueKey ?? "ALL"
  };
}
