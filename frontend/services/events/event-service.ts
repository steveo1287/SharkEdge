import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type {
  EventOption,
  EventParticipantView,
  LedgerBetResult,
  SweatBoardItem,
  SupportedLeagueKey
} from "@/lib/types/ledger";
import {
  buildEventStateDetail,
  deriveBetResultFromLegs,
  formatEventLabelFromParticipants,
  formatScoreboardFromParticipants,
  formatSyncAge,
  gradeLegFromEvent,
  isSettledResult,
  LEAGUE_SPORT_MAP
} from "@/lib/utils/ledger";

import { boxingEventProvider } from "./boxing-provider";
import { espnEventProvider } from "./espn-provider";
import { ncaaFallbackEventProvider } from "./ncaa-fallback-provider";
import type { EventProvider, ProviderEvent } from "./provider-types";
import { ufcEventProvider } from "./ufc-provider";

const LIVE_SYNC_THRESHOLD_MS = 2 * 60 * 1000;
const UPCOMING_EVENT_WINDOW_DAYS = 7;

const providers: EventProvider[] = [
  espnEventProvider,
  ncaaFallbackEventProvider,
  ufcEventProvider,
  boxingEventProvider
];

type EventWithParticipants = Awaited<ReturnType<typeof getUpcomingEvents>>[number];

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function getProviderForLeague(leagueKey: SupportedLeagueKey) {
  return providers.find((provider) => provider.supportsLeague(leagueKey)) ?? null;
}

function getCompetitorKey(leagueKey: SupportedLeagueKey, externalCompetitorId: string | null, name: string) {
  if (externalCompetitorId) {
    return `${leagueKey}:${externalCompetitorId}`;
  }

  return `${leagueKey}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function mapParticipants(
  participants: Array<{
    id: string;
    role: string;
    sortOrder: number;
    score: string | null;
    record: string | null;
    isWinner: boolean | null;
    competitor: {
      id: string;
      name: string;
      abbreviation: string | null;
      type: string;
    };
  }>
): EventParticipantView[] {
  return participants.map((participant) => ({
    id: participant.id,
    competitorId: participant.competitor.id,
    role: participant.role as EventParticipantView["role"],
    sortOrder: participant.sortOrder,
    name: participant.competitor.name,
    abbreviation: participant.competitor.abbreviation,
    type: participant.competitor.type as EventParticipantView["type"],
    score: participant.score,
    record: participant.record,
    isWinner: participant.isWinner
  }));
}

async function upsertProviderEvent(providerEvent: ProviderEvent) {
  const league = await prisma.league.findUnique({
    where: {
      key: providerEvent.leagueKey
    },
    select: {
      id: true,
      sportId: true
    }
  });

  if (!league?.sportId) {
    return null;
  }

  const sportId = league.sportId;

  const event = await prisma.event.upsert({
    where: {
      externalEventId: providerEvent.externalEventId
    },
    update: {
      providerKey: providerEvent.providerKey,
      name: providerEvent.name,
      startTime: new Date(providerEvent.startTime),
      status: providerEvent.status,
      resultState: providerEvent.resultState,
      eventType: providerEvent.eventType,
      venue: providerEvent.venue,
      scoreJson: providerEvent.scoreJson ? toJsonInput(providerEvent.scoreJson) : undefined,
      stateJson: providerEvent.stateJson ? toJsonInput(providerEvent.stateJson) : undefined,
      resultJson: providerEvent.resultJson ? toJsonInput(providerEvent.resultJson) : undefined,
      metadataJson: providerEvent.metadataJson ? toJsonInput(providerEvent.metadataJson) : undefined,
      syncState: "FRESH",
      lastSyncedAt: new Date()
    },
    create: {
      sportId,
      leagueId: league.id,
      externalEventId: providerEvent.externalEventId,
      providerKey: providerEvent.providerKey,
      name: providerEvent.name,
      startTime: new Date(providerEvent.startTime),
      status: providerEvent.status,
      resultState: providerEvent.resultState,
      eventType: providerEvent.eventType,
      venue: providerEvent.venue,
      scoreJson: providerEvent.scoreJson ? toJsonInput(providerEvent.scoreJson) : undefined,
      stateJson: providerEvent.stateJson ? toJsonInput(providerEvent.stateJson) : undefined,
      resultJson: providerEvent.resultJson ? toJsonInput(providerEvent.resultJson) : undefined,
      metadataJson: providerEvent.metadataJson ? toJsonInput(providerEvent.metadataJson) : undefined,
      syncState: "FRESH",
      lastSyncedAt: new Date()
    }
  });

  await Promise.all(
    providerEvent.participants.map(async (participant) => {
      const competitor = await prisma.competitor.upsert({
        where: {
          key: getCompetitorKey(
            providerEvent.leagueKey,
            participant.externalCompetitorId,
            participant.name
          )
        },
        update: {
          name: participant.name,
          shortName: participant.name,
          abbreviation: participant.abbreviation,
          type: participant.type,
          externalIds: participant.externalCompetitorId
            ? {
                espn: participant.externalCompetitorId
              }
            : undefined,
          metadataJson: toJsonInput(participant.metadata)
        },
        create: {
          sportId,
          leagueId: league.id,
          key: getCompetitorKey(
            providerEvent.leagueKey,
            participant.externalCompetitorId,
            participant.name
          ),
          type: participant.type,
          name: participant.name,
          shortName: participant.name,
          abbreviation: participant.abbreviation,
          externalIds: participant.externalCompetitorId
            ? {
                espn: participant.externalCompetitorId
              }
            : undefined,
          metadataJson: toJsonInput(participant.metadata)
        }
      });

      await prisma.eventParticipant.upsert({
        where: {
          eventId_competitorId: {
            eventId: event.id,
            competitorId: competitor.id
          }
        },
        update: {
          role: participant.role,
          sortOrder: participant.sortOrder,
          isHome: participant.role === "HOME" ? true : participant.role === "AWAY" ? false : null,
          isWinner: participant.isWinner,
          score: participant.score,
          record: participant.record,
          metadataJson: toJsonInput(participant.metadata)
        },
        create: {
          eventId: event.id,
          competitorId: competitor.id,
          role: participant.role,
          sortOrder: participant.sortOrder,
          isHome: participant.role === "HOME" ? true : participant.role === "AWAY" ? false : null,
          isWinner: participant.isWinner,
          score: participant.score,
          record: participant.record,
          metadataJson: toJsonInput(participant.metadata)
        }
      });
    })
  );

  return event.id;
}

export async function syncLeagueEventCatalog(leagueKey: SupportedLeagueKey) {
  const provider = getProviderForLeague(leagueKey);
  if (!provider) {
    return {
      leagueKey,
      synced: false,
      note: `${leagueKey} is stored in the event catalog, but live sync is not wired yet.`
    };
  }

  try {
    const events = await provider.fetchScoreboard(leagueKey);
    await Promise.all(events.map((event) => upsertProviderEvent(event)));

    return {
      leagueKey,
      synced: true,
      note: events.length
        ? `${leagueKey} live event state refreshed.`
        : `${leagueKey} returned no events from the provider.`
    };
  } catch (error) {
    return {
      leagueKey,
      synced: false,
      note: error instanceof Error ? error.message : `Failed to refresh ${leagueKey}.`
    };
  }
}

export async function syncSupportedEventCatalog() {
  const leagues = [
    "NBA",
    "NCAAB",
    "MLB",
    "NHL",
    "NFL",
    "NCAAF",
    "UFC",
    "BOXING"
  ] as SupportedLeagueKey[];
  return Promise.all(leagues.map((leagueKey) => syncLeagueEventCatalog(leagueKey)));
}

async function getUpcomingEvents() {
  const now = new Date();
  const max = new Date(now.getTime() + UPCOMING_EVENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return prisma.event.findMany({
    where: {
      OR: [
        {
          startTime: {
            gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            lte: max
          }
        },
        {
          status: "LIVE"
        }
      ]
    },
    orderBy: [{ status: "asc" }, { startTime: "asc" }],
    include: {
      league: {
        select: {
          key: true
        }
      },
      sport: {
        select: {
          code: true
        }
      },
      participants: {
        orderBy: {
          sortOrder: "asc"
        },
        include: {
          competitor: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
              type: true
            }
          }
        }
      }
    }
  });
}

export async function getLedgerEventOptions(): Promise<EventOption[]> {
  const events = await getUpcomingEvents();

  return events.map((event) => {
    const participants = mapParticipants(event.participants);
    const leagueKey = event.league.key as SupportedLeagueKey;

    return {
      id: event.id,
      sportCode: event.sport.code as EventOption["sportCode"],
      leagueKey,
      label: formatEventLabelFromParticipants(participants),
      startTime: event.startTime.toISOString(),
      status: event.status as EventOption["status"],
      eventType: event.eventType as EventOption["eventType"],
      providerKey: event.providerKey,
      lastSyncedAt: event.lastSyncedAt?.toISOString() ?? null,
      liveSupported: Boolean(getProviderForLeague(leagueKey)),
      participants
    };
  });
}

export async function refreshTrackedEventsForOpenBets() {
  const trackedEvents = await prisma.bet.findMany({
    where: {
      result: "OPEN",
      archivedAt: null,
      eventId: {
        not: null
      }
    },
    select: {
      event: {
        select: {
          id: true,
          status: true,
          lastSyncedAt: true,
          league: {
            select: {
              key: true
            }
          }
        }
      }
    }
  });

  const leaguesToRefresh = Array.from(
    new Set(
      trackedEvents
        .map((bet) => {
          const event = bet.event;
          if (!event) {
            return null;
          }

          const leagueKey = event.league.key as SupportedLeagueKey;
          const provider = getProviderForLeague(leagueKey);
          if (!provider) {
            return null;
          }

          const lastSyncedAt = event.lastSyncedAt?.getTime() ?? 0;
          const stale = Date.now() - lastSyncedAt > LIVE_SYNC_THRESHOLD_MS;
          if (event.status === "LIVE" || stale) {
            return leagueKey;
          }

          return null;
        })
        .filter(Boolean) as SupportedLeagueKey[]
    )
  );

  const liveNotes = (await Promise.all(leaguesToRefresh.map((leagueKey) => syncLeagueEventCatalog(leagueKey)))).map(
    (result) => result.note
  );

  const openBets = await prisma.bet.findMany({
    where: {
      result: "OPEN",
      archivedAt: null
    },
    include: {
      event: {
        include: {
          league: {
            select: {
              key: true
            }
          },
          participants: {
            orderBy: {
              sortOrder: "asc"
            },
            include: {
              competitor: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                  type: true
                }
              }
            }
          }
        }
      },
      legs: true
    }
  });

  for (const bet of openBets) {
    if (!bet.legs.length || !bet.event) {
      continue;
    }

    const participants = mapParticipants(bet.event.participants);
    const legResults: LedgerBetResult[] = [];

    for (const leg of bet.legs) {
      const legResult = gradeLegFromEvent({
        marketType: leg.marketType as Parameters<typeof gradeLegFromEvent>[0]["marketType"],
        selection: leg.selection,
        side: leg.side,
        line: leg.line,
        eventStatus: bet.event.status as Parameters<typeof gradeLegFromEvent>[0]["eventStatus"],
        participants
      });

      legResults.push(legResult);

      if (legResult !== leg.result) {
        await prisma.betLeg.update({
          where: {
            id: leg.id
          },
          data: {
            result: legResult
          }
        });
      }
    }

    const aggregateResult = deriveBetResultFromLegs(legResults);
    if (aggregateResult !== bet.result && isSettledResult(aggregateResult)) {
      await prisma.bet.update({
        where: {
          id: bet.id
        },
        data: {
          result: aggregateResult,
          settledAt: new Date()
        }
      });
    }
  }

  return {
    liveNotes
  };
}

export function mapEventRecordToLabel(event: EventWithParticipants | null) {
  if (!event) {
    return null;
  }

  return formatEventLabelFromParticipants(mapParticipants(event.participants));
}

export function buildSweatBoardItem(args: {
  betId: string;
  label: string;
  sport: SweatBoardItem["sport"];
  league: SweatBoardItem["league"];
  betType: SweatBoardItem["betType"];
  result: LedgerBetResult;
  event: {
    status: string;
    lastSyncedAt: Date | null;
    stateJson: Record<string, unknown> | null;
    participants: Array<{
      id: string;
      role: string;
      sortOrder: number;
      score: string | null;
      record: string | null;
      isWinner: boolean | null;
      competitor: {
        id: string;
        name: string;
        abbreviation: string | null;
        type: string;
      };
    }>;
    league: {
      key: string;
    };
  } | null;
  legs: Array<{
    id: string;
    marketLabel: string;
    selection: string;
    result: LedgerBetResult;
    event: {
      id: string;
      status: string;
      participants: Array<{
        id: string;
        role: string;
        sortOrder: number;
        score: string | null;
        record: string | null;
        isWinner: boolean | null;
        competitor: {
          id: string;
          name: string;
          abbreviation: string | null;
          type: string;
        };
      }>;
    } | null;
  }>;
}) {
  const eventParticipants = args.event ? mapParticipants(args.event.participants) : [];
  const eventLabel = args.event ? formatEventLabelFromParticipants(eventParticipants) : null;
  const scoreboard = args.event ? formatScoreboardFromParticipants(eventParticipants) : null;
  const leagueKey = (args.event?.league.key ?? args.league) as SupportedLeagueKey;
  const lastUpdatedAt = args.event?.lastSyncedAt?.toISOString() ?? null;
  const stale =
    !lastUpdatedAt || Date.now() - new Date(lastUpdatedAt).getTime() > LIVE_SYNC_THRESHOLD_MS * 2;
  const liveSupported = Boolean(getProviderForLeague(leagueKey));
  const stateDetail = args.event
    ? buildEventStateDetail({
        status: args.event.status as Parameters<typeof buildEventStateDetail>[0]["status"],
        stateJson: args.event.stateJson
      })
    : null;

  return {
    betId: args.betId,
    label: args.label,
    sport: args.sport,
    league: args.league,
    betType: args.betType,
    result: args.result,
    eventLabel,
    eventStatus: (args.event?.status as SweatBoardItem["eventStatus"]) ?? null,
    eventStateDetail: stateDetail,
    scoreboard,
    liveSupported,
    lastUpdatedAt,
    stale,
    notes: [
      liveSupported ? `Live sync ${stale ? "is stale" : "is current"} (${formatSyncAge(lastUpdatedAt)}).` : `${args.league} live sync is not wired yet; status stays neutral until a supported feed lands.`
    ],
    legs: args.legs.map((leg) => {
      const legParticipants = leg.event ? mapParticipants(leg.event.participants) : [];

      return {
        id: leg.id,
        marketLabel: leg.marketLabel,
        selection: leg.selection,
        result: leg.result,
        eventLabel: leg.event ? formatEventLabelFromParticipants(legParticipants) : null,
        eventStatus: (leg.event?.status as SweatBoardItem["eventStatus"]) ?? null
      };
    })
  } satisfies SweatBoardItem;
}

export async function getEventCatalogHealth() {
  const counts = await prisma.event.groupBy({
    by: ["leagueId"],
    _count: {
      _all: true
    }
  });

  return {
    countsByLeague: counts.length
  };
}

export function getLeagueSportCode(leagueKey: SupportedLeagueKey) {
  return LEAGUE_SPORT_MAP[leagueKey];
}
