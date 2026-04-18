import { Prisma } from "@prisma/client";

import type { BetIntent } from "@/lib/types/bet-intelligence";
import type {
  AlertNotificationView,
  AlertRuleConfig,
  AlertRuleView,
  AlertsPageData,
  ProductSummaryView
} from "@/lib/types/product";
import { alertRuleCreateSchema } from "@/lib/validation/product";
import { prisma } from "@/lib/db/prisma";
import type { OpportunitySnapshotView } from "@/lib/types/opportunity";
import {
  buildProductSetupState,
  DEFAULT_USER_ID,
  ensureDefaultUser,
  getDefaultSubscriptionSummary
} from "@/services/account/user-service";
import {
  getSubscriptionSummaryForCurrentUser,
  hasEntitlement
} from "@/services/account/entitlements-service";
import {
  getCurrentLineDelta,
  getWatchlistItemById
} from "@/services/watchlist/watchlist-service";
import { getPerformanceDashboard } from "@/services/bets/bets-service";
import {
  isOpportunitySnapshot
} from "@/services/opportunities/opportunity-snapshot";

type AlertRuleRow = Prisma.AlertRuleGetPayload<{
  include: {
    watchlistItem: true;
  };
}>;

type NotificationRow = Prisma.AlertNotificationGetPayload<{
  include: {
    watchlistItem: true;
    alertRule: true;
  };
}>;

const premiumAlertTypes = new Set([
  "EV_THRESHOLD_REACHED",
  "BEST_BOOK_CHANGED",
  "CLV_TREND"
] as const);

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

function toIntent(raw: Prisma.JsonValue | null): BetIntent | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  return raw as unknown as BetIntent;
}

function toRecord(raw: Prisma.JsonValue | null) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  return raw as Record<string, unknown>;
}

function getRulePremiumRequirement(type: AlertRuleRow["type"] | AlertRuleView["type"]) {
  return premiumAlertTypes.has(type as (typeof premiumAlertTypes extends Set<infer T> ? T : never));
}

function buildRuleName(type: AlertRuleView["type"], selection: string) {
  switch (type) {
    case "LINE_MOVEMENT_THRESHOLD":
      return `Line move on ${selection}`;
    case "EV_THRESHOLD_REACHED":
      return `EV threshold on ${selection}`;
    case "BEST_BOOK_CHANGED":
      return `Best book changed for ${selection}`;
    case "STARTING_SOON":
      return `${selection} starting soon`;
    case "AVAILABILITY_RETURNED":
      return `${selection} back on the board`;
    case "TARGET_NUMBER_CROSSED":
      return `Target number on ${selection}`;
    case "PROP_LINE_CHANGED":
      return `Prop line move on ${selection}`;
    case "CLV_TREND":
      return `CLV trend alert`;
    default:
      return selection;
  }
}

function mapRuleConfig(raw: Prisma.JsonValue): AlertRuleConfig {
  return raw as unknown as AlertRuleConfig;
}

function getOpportunityPostureNote(item: Awaited<ReturnType<typeof getWatchlistItemById>>) {
  const opportunity = item?.opportunitySnapshot;
  if (!opportunity) {
    return null;
  }

  return `Current posture: ${opportunity.actionState.replace(/_/g, " ")} at score ${opportunity.opportunityScore}.`;
}

function mapAlertRule(row: AlertRuleRow): AlertRuleView {
  return {
    id: row.id,
    watchlistItemId: row.watchlistItemId ?? null,
    type: row.type as AlertRuleView["type"],
    status: row.status as AlertRuleView["status"],
    name: row.name,
    sport: row.sport,
    league: row.league as AlertRuleView["league"],
    eventLabel: row.watchlistItem?.eventLabel ?? null,
    marketLabel: row.marketLabel ?? null,
    selection: row.selection ?? null,
    config: mapRuleConfig(row.configJson),
    lastEvaluatedAt: row.lastEvaluatedAt?.toISOString() ?? null,
    lastTriggeredAt: row.lastTriggeredAt?.toISOString() ?? null,
    premiumRequired: getRulePremiumRequirement(row.type)
  };
}

async function mapNotification(row: NotificationRow): Promise<AlertNotificationView> {
  const context = toRecord(row.contextJson);
  const snapshotFromContext = isOpportunitySnapshot(context?.opportunitySnapshot)
    ? (context?.opportunitySnapshot as OpportunitySnapshotView)
    : null;
  return {
    id: row.id,
    alertRuleId: row.alertRuleId ?? null,
    watchlistItemId: row.watchlistItemId ?? null,
    severity: row.severity as AlertNotificationView["severity"],
    title: row.title,
    body: row.body,
    sourcePath: row.sourcePath ?? null,
    sourcePage: row.sourcePage ?? null,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    dismissedAt: row.dismissedAt?.toISOString() ?? null,
    eventLabel: row.watchlistItem?.eventLabel ?? null,
    selection: row.watchlistItem?.selection ?? null,
    betIntent: toIntent(row.watchlistItem?.intentJson ?? null),
    opportunitySnapshot: snapshotFromContext
  };
}

async function emitNotification(args: {
  alertRuleId: string;
  watchlistItemId: string | null;
  title: string;
  body: string;
  severity: AlertNotificationView["severity"];
  sourcePath: string | null;
  sourcePage: string | null;
  dedupeKey: string;
  context: Record<string, unknown>;
  opportunitySnapshot?: OpportunitySnapshotView | null;
}) {
  await prisma.alertNotification.create({
    data: {
      userId: DEFAULT_USER_ID,
      alertRuleId: args.alertRuleId,
      watchlistItemId: args.watchlistItemId,
      title: args.title,
      body: args.body,
      severity: args.severity,
      sourcePath: args.sourcePath,
      sourcePage: args.sourcePage,
      dedupeKey: args.dedupeKey,
      contextJson: toJsonInput({
        ...args.context,
        opportunitySnapshot: args.opportunitySnapshot ?? null
      })
    }
  }).catch((error: unknown) => {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      String((error as { code?: string }).code) === "P2002"
    ) {
      return null;
    }

    throw error;
  });
}

async function evaluateSingleRule(row: AlertRuleRow) {
  const config = mapRuleConfig(row.configJson);

  if (config.type === "CLV_TREND") {
    const performance = await getPerformanceDashboard();
    const averageClv = performance.summary.averageClv;

    await prisma.alertRule.update({
      where: {
        id: row.id
      },
      data: {
        lastEvaluatedAt: new Date(),
        evaluationStateJson: toJsonInput({
          averageClv
        })
      }
    });

    if (typeof averageClv === "number" && averageClv <= config.thresholdPct) {
      await emitNotification({
        alertRuleId: row.id,
        watchlistItemId: null,
        title: "CLV trend slipped below target",
        body: `Average CLV is ${averageClv.toFixed(2)}%, which crossed your ${config.thresholdPct.toFixed(2)}% alert threshold.`,
        severity: "PREMIUM",
        sourcePath: "/performance",
        sourcePage: "performance",
        dedupeKey: `${row.id}:clv:${averageClv.toFixed(2)}`,
        context: {
          averageClv
        }
      });

      await prisma.alertRule.update({
        where: {
          id: row.id
        },
        data: {
          lastTriggeredAt: new Date()
        }
      });
    }

    return;
  }

  if (!row.watchlistItemId) {
    return;
  }

  const item = await getWatchlistItemById(row.watchlistItemId);
  if (!item) {
    return;
  }
  const postureNote = getOpportunityPostureNote(item);
  const opportunitySnapshot = item.opportunitySnapshot;

  const current = item.current;
  const now = Date.now();
  const stateUpdate = {
    lastEvaluatedAt: new Date(),
    evaluationStateJson: toJsonInput({
      available: current.available,
      oddsAmerican: current.oddsAmerican,
      line: current.line,
      sportsbookName: current.sportsbookName,
      eventStatus: current.eventStatus,
      startTime: current.startTime
    })
  };

  await prisma.alertRule.update({
    where: {
      id: row.id
    },
    data: stateUpdate
  });

  if (!current.available && config.type !== "AVAILABILITY_RETURNED") {
    return;
  }

  const savedSportsbook = item.sportsbookName;
  const lineDelta = getCurrentLineDelta(item);

  if (config.type === "LINE_MOVEMENT_THRESHOLD" || config.type === "PROP_LINE_CHANGED") {
    if (typeof lineDelta === "number" && Math.abs(lineDelta) >= config.threshold) {
      await emitNotification({
        alertRuleId: row.id,
        watchlistItemId: row.watchlistItemId,
        title: `${item.selection} moved ${lineDelta > 0 ? "+" : ""}${lineDelta.toFixed(1)}`,
        body: `${item.eventLabel} moved from ${item.line ?? "--"} to ${current.line ?? "--"} against your ${config.threshold}-point trigger.${postureNote ? ` ${postureNote}` : ""}`,
        severity: config.type === "PROP_LINE_CHANGED" ? "PREMIUM" : "ACTION",
        sourcePath: item.intent.matchupHref ?? item.sourcePath,
        sourcePage: item.sourcePage,
        dedupeKey: `${row.id}:line:${current.line ?? "na"}`,
        context: {
          savedLine: item.line,
          currentLine: current.line
        },
        opportunitySnapshot
      });

      await prisma.alertRule.update({
        where: {
          id: row.id
        },
        data: {
          lastTriggeredAt: new Date()
        }
      });
    }

    return;
  }

  if (config.type === "EV_THRESHOLD_REACHED") {
    if (typeof current.expectedValuePct === "number" && current.expectedValuePct >= config.thresholdPct) {
      await emitNotification({
        alertRuleId: row.id,
        watchlistItemId: row.watchlistItemId,
        title: `${item.selection} hit EV ${current.expectedValuePct.toFixed(2)}%`,
        body: `${item.eventLabel} is now at ${current.expectedValuePct.toFixed(2)}% market EV, clearing your ${config.thresholdPct.toFixed(2)}% threshold.${postureNote ? ` ${postureNote}` : ""}`,
        severity: "PREMIUM",
        sourcePath: item.intent.matchupHref ?? item.sourcePath,
        sourcePage: item.sourcePage,
        dedupeKey: `${row.id}:ev:${current.expectedValuePct.toFixed(2)}`,
        context: {
          expectedValuePct: current.expectedValuePct
        },
        opportunitySnapshot
      });

      await prisma.alertRule.update({
        where: {
          id: row.id
        },
        data: {
          lastTriggeredAt: new Date()
        }
      });
    }

    return;
  }

  if (config.type === "BEST_BOOK_CHANGED") {
    if (savedSportsbook && current.sportsbookName && current.sportsbookName !== savedSportsbook) {
      await emitNotification({
        alertRuleId: row.id,
        watchlistItemId: row.watchlistItemId,
        title: `${item.selection} has a new best book`,
        body: `${item.eventLabel} moved from ${savedSportsbook} to ${current.sportsbookName} as the best available book.${postureNote ? ` ${postureNote}` : ""}`,
        severity: "PREMIUM",
        sourcePath: item.intent.matchupHref ?? item.sourcePath,
        sourcePage: item.sourcePage,
        dedupeKey: `${row.id}:book:${current.sportsbookName}`,
        context: {
          previousBook: savedSportsbook,
          currentBook: current.sportsbookName
        },
        opportunitySnapshot
      });

      await prisma.alertRule.update({
        where: {
          id: row.id
        },
        data: {
          lastTriggeredAt: new Date()
        }
      });
    }

    return;
  }

  if (config.type === "STARTING_SOON") {
    if (!current.startTime || current.eventStatus === "FINAL" || current.eventStatus === "CANCELED") {
      return;
    }

    const startTime = new Date(current.startTime).getTime();
    const windowStart = startTime - config.minutesBefore * 60 * 1000;

    if (now >= windowStart && now <= startTime) {
      await emitNotification({
        alertRuleId: row.id,
        watchlistItemId: row.watchlistItemId,
        title: `${item.eventLabel} starts in under ${config.minutesBefore}m`,
        body: `${item.selection} is approaching kickoff/start time. SharkEdge is surfacing it while the number is still live.${postureNote ? ` ${postureNote}` : ""}`,
        severity: "ACTION",
        sourcePath: item.intent.matchupHref ?? item.sourcePath,
        sourcePage: item.sourcePage,
        dedupeKey: `${row.id}:start:${current.startTime}:${config.minutesBefore}`,
        context: {
          startTime: current.startTime
        },
        opportunitySnapshot
      });

      await prisma.alertRule.update({
        where: {
          id: row.id
        },
        data: {
          lastTriggeredAt: new Date()
        }
      });
    }

    return;
  }

  if (config.type === "AVAILABILITY_RETURNED") {
    const previous = row.evaluationStateJson as Record<string, unknown> | null;
    const previouslyAvailable = Boolean(previous?.available);

    if (current.available && !previouslyAvailable) {
      await emitNotification({
        alertRuleId: row.id,
        watchlistItemId: row.watchlistItemId,
        title: `${item.selection} is back on the board`,
        body: `${item.eventLabel} is available again at ${current.sportsbookName ?? "the current book mesh"}.${postureNote ? ` ${postureNote}` : ""}`,
        severity: "ACTION",
        sourcePath: item.intent.matchupHref ?? item.sourcePath,
        sourcePage: item.sourcePage,
        dedupeKey: `${row.id}:available:${current.sportsbookName ?? "market"}`,
        context: {
          sportsbookName: current.sportsbookName
        },
        opportunitySnapshot
      });

      await prisma.alertRule.update({
        where: {
          id: row.id
        },
        data: {
          lastTriggeredAt: new Date()
        }
      });
    }

    return;
  }

  if (config.type === "TARGET_NUMBER_CROSSED") {
    if (typeof current.line !== "number") {
      return;
    }

    const savedLine = item.line;
    const crossed =
      typeof savedLine === "number"
        ? (savedLine < config.targetLine && current.line >= config.targetLine) ||
          (savedLine > config.targetLine && current.line <= config.targetLine) ||
          current.line === config.targetLine
        : current.line === config.targetLine;

    if (crossed) {
      await emitNotification({
        alertRuleId: row.id,
        watchlistItemId: row.watchlistItemId,
        title: `${item.selection} crossed ${config.targetLine}`,
        body: `${item.eventLabel} moved to ${current.line}, crossing your target number of ${config.targetLine}.${postureNote ? ` ${postureNote}` : ""}`,
        severity: "ACTION",
        sourcePath: item.intent.matchupHref ?? item.sourcePath,
        sourcePage: item.sourcePage,
        dedupeKey: `${row.id}:target:${current.line}`,
        context: {
          targetLine: config.targetLine,
          currentLine: current.line
        },
        opportunitySnapshot
      });

      await prisma.alertRule.update({
        where: {
          id: row.id
        },
        data: {
          lastTriggeredAt: new Date()
        }
      });
    }
  }
}

export async function evaluateAlertRules() {
  await ensureDefaultUser();
  const rules = await prisma.alertRule.findMany({
    where: {
      userId: DEFAULT_USER_ID,
      status: {
        in: ["ACTIVE", "MUTED"]
      }
    },
    include: {
      watchlistItem: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  for (const rule of rules) {
    if (rule.status === "MUTED") {
      continue;
    }

    await evaluateSingleRule(rule);
  }
}

export async function createAlertRule(input: {
  watchlistItemId: string;
  type: AlertRuleView["type"];
  name?: string;
  config: AlertRuleConfig;
}) {
  await ensureDefaultUser();
  const parsed = alertRuleCreateSchema.parse({
    watchlistItemId: input.watchlistItemId,
    type: input.type,
    name: input.name ?? `Alert ${input.type}`,
    config: input.config
  });
  const plan = await getSubscriptionSummaryForCurrentUser();
  const activeCount = await prisma.alertRule.count({
    where: {
      userId: DEFAULT_USER_ID,
      status: "ACTIVE"
    }
  });

  if (activeCount >= plan.limits.activeAlerts) {
    throw new Error(
      `Active alert limit reached for the ${plan.planTier.toLowerCase()} tier. Upgrade to track more alert rules.`
    );
  }

  if (getRulePremiumRequirement(parsed.type) && !(await hasEntitlement("advanced_alerts"))) {
    throw new Error("This alert type is premium-only right now.");
  }

  const item = await getWatchlistItemById(parsed.watchlistItemId);
  if (!item) {
    throw new Error("Watchlist item not found.");
  }

  const rule = await prisma.alertRule.create({
    data: {
      userId: DEFAULT_USER_ID,
      watchlistItemId: parsed.watchlistItemId,
      eventId: item.eventId,
      eventExternalId: item.eventExternalId,
      type: parsed.type,
      status: "ACTIVE",
      name: parsed.name || buildRuleName(parsed.type, item.selection),
      sport: item.sport,
      league: item.league,
      marketType: item.marketType,
      marketLabel: item.marketLabel,
      selection: item.selection,
      configJson: toJsonInput(parsed.config)
    },
    include: {
      watchlistItem: true
    }
  });

  return mapAlertRule(rule);
}

export async function getAlertsPageData(): Promise<AlertsPageData> {
  try {
    await evaluateAlertRules();
    const [plan, notifications, rules] = await Promise.all([
      getSubscriptionSummaryForCurrentUser(),
      prisma.alertNotification.findMany({
        where: {
          userId: DEFAULT_USER_ID,
          dismissedAt: null
        },
        include: {
          watchlistItem: true,
          alertRule: true
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 60
      }),
      prisma.alertRule.findMany({
        where: {
          userId: DEFAULT_USER_ID
        },
        include: {
          watchlistItem: true
        },
        orderBy: {
          createdAt: "desc"
        }
      })
    ]);

    return {
      setup: null,
      notifications: await Promise.all(notifications.map(mapNotification)),
      rules: rules.map(mapAlertRule),
      unreadCount: notifications.filter((item) => item.readAt === null).length,
      activeRuleCount: rules.filter((item) => item.status === "ACTIVE").length,
      inAppOnly: true,
      plan
    };
  } catch (error) {
    return {
      setup: buildProductSetupState("Alerts", error),
      notifications: [],
      rules: [],
      unreadCount: 0,
      activeRuleCount: 0,
      inAppOnly: true,
      plan: getDefaultSubscriptionSummary()
    };
  }
}

export async function markNotificationRead(id: string) {
  await ensureDefaultUser();
  await prisma.alertNotification.update({
    where: {
      id
    },
    data: {
      readAt: new Date()
    }
  });
}

export async function dismissNotification(id: string) {
  await ensureDefaultUser();
  await prisma.alertNotification.update({
    where: {
      id
    },
    data: {
      dismissedAt: new Date()
    }
  });
}

export async function updateAlertRuleState(
  id: string,
  input: {
    status?: AlertRuleView["status"];
    mute?: boolean;
  }
) {
  await ensureDefaultUser();
  await prisma.alertRule.update({
    where: {
      id
    },
    data: {
      status: input.mute ? "MUTED" : input.status
    }
  });
}

export async function getAlertSummary(): Promise<ProductSummaryView> {
  try {
    await evaluateAlertRules();
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
