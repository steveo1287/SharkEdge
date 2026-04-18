import { Prisma } from "@prisma/client";

import type { BetIntent } from "@/lib/types/bet-intelligence";
import type { GameStatus, MarketType } from "@/lib/types/domain";
import type {
  ProductSummaryView,
  WatchlistFilters,
  WatchlistItemView,
  WatchlistPageData
} from "@/lib/types/product";
import { watchlistFiltersSchema } from "@/lib/validation/product";
import { prisma } from "@/lib/db/prisma";
import { getPropById } from "@/services/odds/props-service";
import { getMatchupDetail } from "@/services/matchups/matchup-service";
import { buildOpportunitySnapshot } from "@/services/opportunities/opportunity-snapshot";
import {
  buildBetSignalOpportunity,
  buildPropOpportunity
} from "@/services/opportunities/opportunity-service";
import {
  buildProductSetupState,
  DEFAULT_USER_ID,
  ensureDefaultUser,
  getDefaultSubscriptionSummary
} from "@/services/account/user-service";
import { getSubscriptionSummaryForCurrentUser } from "@/services/account/entitlements-service";

type WatchlistRow = Prisma.WatchlistItemGetPayload<{
  include: {
    sportsbook: true;
    alertRules: {
      where: {
        status: {
          in: ["ACTIVE", "MUTED"];
        };
      };
    };
  };
}>;

type WatchlistResolutionContext = {
  detailByRouteId: Map<string, Promise<Awaited<ReturnType<typeof getMatchupDetail>>>>;
  propBySourceId: Map<string, Promise<Awaited<ReturnType<typeof getPropById>>>>;
};

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function toIntent(value: Prisma.JsonValue): BetIntent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as unknown as BetIntent;
}

function isPropMarket(marketType: MarketType) {
  return (
    marketType === "player_points" ||
    marketType === "player_rebounds" ||
    marketType === "player_assists" ||
    marketType === "player_threes" ||
    marketType === "fight_winner" ||
    marketType === "method_of_victory" ||
    marketType === "round_total" ||
    marketType === "round_winner"
  );
}

function parseMatchupRoute(matchupHref: string | null | undefined) {
  if (!matchupHref) {
    return null;
  }

  const marker = "/game/";
  const index = matchupHref.indexOf(marker);
  if (index === -1) {
    return null;
  }

  return matchupHref.slice(index + marker.length) || null;
}

function getLineValue(
  savedLine: number | null,
  currentLine: number | null
) {
  if (typeof savedLine !== "number" || typeof currentLine !== "number") {
    return null;
  }

  return Number((currentLine - savedLine).toFixed(2));
}

function isStale(lastUpdatedAt: string | null | undefined) {
  if (!lastUpdatedAt) {
    return true;
  }

  return Date.now() - new Date(lastUpdatedAt).getTime() > 20 * 60 * 1000;
}

function toWatchStatus(eventStatus: GameStatus | null) {
  if (eventStatus === "LIVE") {
    return "live";
  }

  if (eventStatus === "FINAL" || eventStatus === "CANCELED" || eventStatus === "POSTPONED") {
    return "final";
  }

  if (eventStatus === "PREGAME") {
    return "upcoming";
  }

  return "unavailable";
}

function createWatchlistResolutionContext(): WatchlistResolutionContext {
  return {
    detailByRouteId: new Map(),
    propBySourceId: new Map()
  };
}

function getCachedMatchupDetail(
  context: WatchlistResolutionContext,
  routeId: string | null
) {
  if (!routeId) {
    return Promise.resolve(null);
  }

  const existing = context.detailByRouteId.get(routeId);
  if (existing) {
    return existing;
  }

  const request = getMatchupDetail(routeId).catch(() => null);
  context.detailByRouteId.set(routeId, request);
  return request;
}

function getCachedProp(
  context: WatchlistResolutionContext,
  sourceItemId: string | null
) {
  if (!sourceItemId) {
    return Promise.resolve(null);
  }

  const existing = context.propBySourceId.get(sourceItemId);
  if (existing) {
    return existing;
  }

  const request = getPropById(sourceItemId).catch(() => null);
  context.propBySourceId.set(sourceItemId, request);
  return request;
}

async function resolveCurrentState(
  row: WatchlistRow,
  intent: BetIntent | null,
  context: WatchlistResolutionContext
) {
  const base = {
    available: false,
    stale: true,
    eventStatus: null as GameStatus | null,
    stateDetail: null as string | null,
    scoreboard: null as string | null,
    startTime: null as string | null,
    sportsbookName: row.sportsbookName ?? row.sportsbook?.name ?? null,
    oddsAmerican: null as number | null,
    line: null as number | null,
    expectedValuePct: null as number | null,
    bestBookChanged: false,
    opportunitySnapshot: null,
    note:
      row.supportNote ??
      "Current market lookup is unavailable right now, so SharkEdge is preserving the saved ticket context only."
  };

  const routeId = parseMatchupRoute(intent?.matchupHref ?? null) ?? row.eventExternalId ?? null;
  const detail = await getCachedMatchupDetail(context, routeId);
  const sourceItemId = intent?.context?.sourceItemId ?? intent?.legs[0]?.sourceItemId ?? null;

  if (sourceItemId && isPropMarket(row.marketType as MarketType)) {
    const prop = await getCachedProp(context, sourceItemId);
    if (prop) {
      const opportunity = buildPropOpportunity(prop, detail?.providerHealth ?? null);
      return {
        available: true,
        stale: detail ? isStale(detail.lastUpdatedAt) : prop.source !== "live",
        eventStatus: detail?.status ?? "PREGAME",
        stateDetail: detail?.stateDetail ?? prop.supportNote ?? null,
        scoreboard: detail?.scoreboard ?? prop.gameLabel ?? null,
        startTime: detail?.startTime ?? null,
        sportsbookName: prop.bestAvailableSportsbookName ?? prop.sportsbook.name,
        oddsAmerican: prop.bestAvailableOddsAmerican ?? prop.oddsAmerican,
        line: prop.line,
        expectedValuePct: prop.expectedValuePct ?? null,
        bestBookChanged:
          Boolean(row.sportsbookName) &&
          (prop.bestAvailableSportsbookName ?? prop.sportsbook.name) !== row.sportsbookName,
        opportunitySnapshot: buildOpportunitySnapshot(opportunity),
        note: prop.supportNote ?? row.supportNote ?? "Live prop snapshot resolved from the current odds mesh."
      };
    }
  }

  if (detail) {
    const signal =
      detail.betSignals.find((entry) => entry.id === sourceItemId) ??
      detail.betSignals.find(
        (entry) =>
          entry.marketType === row.marketType &&
          entry.selection.toLowerCase() === row.selection.toLowerCase()
      ) ??
      null;

    if (signal) {
      const opportunity = buildBetSignalOpportunity(
        signal,
        row.league as WatchlistItemView["league"],
        detail.providerHealth
      );
      return {
        available: true,
        stale: isStale(detail.lastUpdatedAt),
        eventStatus: detail.status,
        stateDetail: detail.stateDetail,
        scoreboard: detail.scoreboard,
        startTime: detail.startTime,
        sportsbookName: signal.sportsbookName ?? row.sportsbookName ?? null,
        oddsAmerican: signal.oddsAmerican,
        line: signal.line ?? null,
        expectedValuePct: signal.expectedValuePct ?? null,
        bestBookChanged:
          Boolean(row.sportsbookName) &&
          (signal.sportsbookName ?? null) !== row.sportsbookName,
        opportunitySnapshot: buildOpportunitySnapshot(opportunity),
        note: signal.supportNote ?? detail.supportNote
      };
    }

    return {
      ...base,
      stale: isStale(detail.lastUpdatedAt),
      eventStatus: detail.status,
      stateDetail: detail.stateDetail,
      scoreboard: detail.scoreboard,
      startTime: detail.startTime,
      note: detail.supportNote
    };
  }

  return base;
}

async function resolveLinkedEventId(intent: BetIntent) {
  if (intent.eventId) {
    return intent.eventId;
  }

  if (!intent.externalEventId) {
    return null;
  }

  const event = await prisma.event.findFirst({
    where: {
      externalEventId: intent.externalEventId,
      league: {
        key: intent.league
      }
    },
    select: {
      id: true
    }
  });

  return event?.id ?? null;
}

export function parseWatchlistFilters(
  searchParams: Record<string, string | string[] | undefined>
) {
  return watchlistFiltersSchema.parse({
    sport: Array.isArray(searchParams.sport) ? searchParams.sport[0] : searchParams.sport,
    league: Array.isArray(searchParams.league) ? searchParams.league[0] : searchParams.league,
    market: Array.isArray(searchParams.market) ? searchParams.market[0] : searchParams.market,
    liveStatus: Array.isArray(searchParams.liveStatus)
      ? searchParams.liveStatus[0]
      : searchParams.liveStatus,
    status: Array.isArray(searchParams.status) ? searchParams.status[0] : searchParams.status
  }) satisfies WatchlistFilters;
}

export async function createWatchlistItem(intent: BetIntent) {
  await ensureDefaultUser();
  const plan = await getSubscriptionSummaryForCurrentUser();
  const activeCount = await prisma.watchlistItem.count({
    where: {
      userId: DEFAULT_USER_ID,
      status: "ACTIVE"
    }
  });

  if (activeCount >= plan.limits.watchlistItems) {
    throw new Error(
      `Watchlist limit reached for the ${plan.planTier.toLowerCase()} tier. Upgrade to save more plays.`
    );
  }

  const existing = await prisma.watchlistItem.findFirst({
    where: {
      userId: DEFAULT_USER_ID,
      status: "ACTIVE",
      league: intent.league,
      eventExternalId: intent.externalEventId ?? null,
      marketType: intent.legs[0]?.marketType ?? "other",
      selection: intent.legs[0]?.selection ?? intent.eventLabel
    }
  });

  if (existing) {
    return existing.id;
  }

  const linkedEventId = await resolveLinkedEventId(intent);

  const created = await prisma.watchlistItem.create({
    data: {
      userId: DEFAULT_USER_ID,
      sport: intent.sport,
      league: intent.league,
      eventId: linkedEventId,
      eventExternalId: intent.externalEventId ?? intent.legs[0]?.externalEventId ?? null,
      eventLabel: intent.eventLabel,
      marketType: intent.legs[0]?.marketType ?? "other",
      marketLabel: intent.legs[0]?.marketLabel ?? intent.betType,
      selection: intent.legs[0]?.selection ?? intent.eventLabel,
      side: intent.legs[0]?.side ?? null,
      line: intent.legs[0]?.line ?? null,
      oddsAmerican: intent.legs[0]?.oddsAmerican ?? 0,
      sportsbookId: null,
      sportsbookName: intent.legs[0]?.sportsbookName ?? intent.sportsbookName ?? null,
      sourcePage: intent.context?.sourcePage ?? "board",
      sourcePath: intent.context?.sourcePath ?? "/",
      supportStatus: intent.context?.supportStatus ?? null,
      supportNote: intent.context?.supportNote ?? null,
      isLive: intent.isLive,
      intentJson: toJsonInput(intent),
      contextJson: toJsonInput(intent.context ?? null)
    }
  });

  return created.id;
}

async function mapWatchlistItem(
  row: WatchlistRow,
  context: WatchlistResolutionContext
): Promise<WatchlistItemView | null> {
  const intent = toIntent(row.intentJson);
  if (!intent) {
    return null;
  }

  const currentState = await resolveCurrentState(row, intent, context);
  const { opportunitySnapshot, ...current } = currentState;

  return {
    id: row.id,
    savedAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    sport: row.sport,
    league: row.league as WatchlistItemView["league"],
    eventId: row.eventId,
    eventExternalId: row.eventExternalId ?? null,
    eventLabel: row.eventLabel,
    marketType: row.marketType as WatchlistItemView["marketType"],
    marketLabel: row.marketLabel,
    selection: row.selection,
    side: row.side ?? null,
    line: row.line ?? null,
    oddsAmerican: row.oddsAmerican,
    sportsbookName: row.sportsbookName ?? row.sportsbook?.name ?? null,
    sourcePage: row.sourcePage,
    sourcePath: row.sourcePath,
    supportStatus: (row.supportStatus as WatchlistItemView["supportStatus"]) ?? null,
    supportNote: row.supportNote ?? null,
    isLive: row.isLive,
    status: row.status as WatchlistItemView["status"],
    intent,
    current,
    alertCount: row.alertRules.length,
    opportunitySnapshot,
    decision: null,
    changeIntelligence: null,
    prioritization: {
      attentionTier: "low",
      attentionDirection: "stable",
      surfaced: false,
      surfacedReasonCodes: [],
      shortAttentionLabel: "Default",
      shortAttentionExplanation: null,
      stableAttentionSignature: "",
      sortWeight: 0,
      freshnessBucket: "unknown"
    }
  };
}

export async function getWatchlistPageData(
  filters: WatchlistFilters
): Promise<WatchlistPageData> {
  try {
    await ensureDefaultUser();
    const [plan, rows] = await Promise.all([
      getSubscriptionSummaryForCurrentUser(),
      prisma.watchlistItem.findMany({
        where: {
          userId: DEFAULT_USER_ID,
          status: filters.status,
          ...(filters.sport !== "ALL" ? { sport: filters.sport } : {}),
          ...(filters.league !== "ALL" ? { league: filters.league } : {}),
          ...(filters.market !== "ALL" ? { marketType: filters.market } : {})
        },
        include: {
          sportsbook: true,
          alertRules: {
            where: {
              status: {
                in: ["ACTIVE", "MUTED"]
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      })
    ]);

    const resolutionContext = createWatchlistResolutionContext();
    const mapped = (
      await Promise.all(rows.map((row) => mapWatchlistItem(row, resolutionContext)))
    ).filter(Boolean) as WatchlistItemView[];
    const filtered =
      filters.liveStatus === "all"
        ? mapped
        : mapped.filter((item) => toWatchStatus(item.current.eventStatus) === filters.liveStatus);
    const ranked = [...filtered].sort((left, right) => {
      const scoreDelta =
        (right.opportunitySnapshot?.opportunityScore ?? -1) -
        (left.opportunitySnapshot?.opportunityScore ?? -1);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return right.savedAt.localeCompare(left.savedAt);
    });

    return {
      setup: null,
      filters,
      items: ranked,
      summary: {
        total: ranked.length,
        live: ranked.filter((item) => toWatchStatus(item.current.eventStatus) === "live").length,
        upcoming: ranked.filter((item) => toWatchStatus(item.current.eventStatus) === "upcoming").length,
        unavailable: ranked.filter((item) => !item.current.available).length
      },
      plan
    };
  } catch (error) {
    return {
      setup: buildProductSetupState("Watchlist", error),
      filters,
      items: [],
      summary: {
        total: 0,
        live: 0,
        upcoming: 0,
        unavailable: 0
      },
      plan: getDefaultSubscriptionSummary()
    };
  }
}

export async function archiveWatchlistItem(id: string) {
  await ensureDefaultUser();
  await prisma.watchlistItem.update({
    where: {
      id
    },
    data: {
      status: "ARCHIVED",
      archivedAt: new Date()
    }
  });
}

export async function restoreWatchlistItem(id: string) {
  await ensureDefaultUser();
  await prisma.watchlistItem.update({
    where: {
      id
    },
    data: {
      status: "ACTIVE",
      archivedAt: null
    }
  });
}

export async function deleteWatchlistItem(id: string) {
  await ensureDefaultUser();
  await prisma.watchlistItem.delete({
    where: {
      id
    }
  });
}

export async function getWatchlistSummary(): Promise<ProductSummaryView> {
  try {
    await ensureDefaultUser();
    const [watchlistCount, unreadAlertCount, plan] = await Promise.all([
      prisma.watchlistItem.count({
        where: {
          userId: DEFAULT_USER_ID,
          status: "ACTIVE"
        }
      }),
      prisma.alertNotification.count({
        where: {
          userId: DEFAULT_USER_ID,
          readAt: null,
          dismissedAt: null
        }
      }),
      getSubscriptionSummaryForCurrentUser()
    ]);

    return {
      watchlistCount,
      unreadAlertCount,
      plan
    };
  } catch {
    return {
      watchlistCount: 0,
      unreadAlertCount: 0,
      plan: getDefaultSubscriptionSummary()
    };
  }
}

export async function getWatchlistItemById(id: string) {
  const row = await prisma.watchlistItem.findUnique({
    where: {
      id
    },
    include: {
      sportsbook: true,
      alertRules: {
        where: {
          status: {
            in: ["ACTIVE", "MUTED"]
          }
        }
      }
    }
  });

  if (!row) {
    return null;
  }

  const resolutionContext = createWatchlistResolutionContext();
  return mapWatchlistItem(row, resolutionContext);
}

export function getCurrentLineDelta(item: WatchlistItemView) {
  return getLineValue(item.line, item.current.line);
}
