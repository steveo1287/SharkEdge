import { PlanTier, Prisma, SubscriptionState } from "@prisma/client";

import { getServerDatabaseResolution, hasUsableServerDatabaseUrl, prisma } from "@/lib/db/prisma";
import type { OpportunityBankrollSettings } from "@/lib/types/opportunity";
import type {
  AlertType,
  NotificationPreferencesView,
  PlanTier as PlanTierView,
  ProductSetupState,
  SubscriptionState as SubscriptionStateView,
  SubscriptionSummary
} from "@/lib/types/product";

export const DEFAULT_USER_ID = "user_demo";

const FREE_LIMITS = {
  watchlistItems: 20,
  activeAlerts: 3,
  topPlaysVisible: 2
} as const;

const PREMIUM_LIMITS = {
  watchlistItems: 250,
  activeAlerts: 50,
  topPlaysVisible: 8
} as const;

function getDefaultPlanTier(): PlanTier {
  return process.env.SHARKEDGE_DEFAULT_PLAN_TIER === "PREMIUM" ? "PREMIUM" : "FREE";
}

function getDefaultSubscriptionState(): SubscriptionState {
  const raw = process.env.SHARKEDGE_DEFAULT_SUBSCRIPTION_STATE;

  if (raw === "ACTIVE" || raw === "CANCELED" || raw === "PAST_DUE") {
    return raw;
  }

  return getDefaultPlanTier() === "PREMIUM" ? "ACTIVE" : "NONE";
}

export function buildDefaultNotificationPreferences(): NotificationPreferencesView {
  const allSports = {
    NBA: true,
    NCAAB: true,
    MLB: true,
    NHL: true,
    NFL: true,
    NCAAF: true,
    UFC: true,
    BOXING: true
  } as const;

  const allAlertTypes: Record<AlertType, boolean> = {
    LINE_MOVEMENT_THRESHOLD: true,
    EV_THRESHOLD_REACHED: true,
    BEST_BOOK_CHANGED: true,
    STARTING_SOON: true,
    AVAILABILITY_RETURNED: true,
    TARGET_NUMBER_CROSSED: true,
    PROP_LINE_CHANGED: true,
    CLV_TREND: true
  };

  return {
    deliveryChannels: ["IN_APP"],
    quietHours: {
      enabled: false,
      startHour: 23,
      endHour: 7
    },
    sportPreferences: { ...allSports },
    alertTypePreferences: allAlertTypes
  };
}

function toJsonInput(value: unknown) {
  return value as Prisma.InputJsonValue;
}

export function buildDefaultBankrollSettings(): OpportunityBankrollSettings {
  return {
    bankroll: 5000,
    availableBankroll: 5000,
    unitSize: 100,
    riskTolerance: "CONSERVATIVE",
    baseKellyFraction: 0.25,
    maxSingleBetPct: 0.0225,
    maxOpenExposurePct: 0.12,
    maxEventExposurePct: 0.04,
    maxMarketExposurePct: 0.03
  };
}

function normalizeBankrollSettings(raw: Prisma.JsonValue | null): OpportunityBankrollSettings {
  const defaults = buildDefaultBankrollSettings();

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }

  const value = raw as Partial<{
    bankroll: number;
    availableBankroll: number;
    unitSize: number;
    riskTolerance: OpportunityBankrollSettings["riskTolerance"];
    baseKellyFraction: number;
    preferredStakePlan: string;
    maxSingleBetPct: number;
    maxOpenExposurePct: number;
    maxEventExposurePct: number;
    maxMarketExposurePct: number;
  }>;

  const riskTolerance =
    value.riskTolerance === "AGGRESSIVE" ||
    value.riskTolerance === "BALANCED" ||
    value.riskTolerance === "CONSERVATIVE"
      ? value.riskTolerance
      : value.preferredStakePlan === "kelly"
        ? "BALANCED"
        : "CONSERVATIVE";
  const bankroll =
    typeof value.bankroll === "number" && value.bankroll > 0
      ? value.bankroll
      : defaults.bankroll;
  const availableBankroll =
    typeof value.availableBankroll === "number" && value.availableBankroll > 0
      ? Math.min(value.availableBankroll, bankroll)
      : bankroll;
  const unitSize =
    typeof value.unitSize === "number" && value.unitSize > 0
      ? value.unitSize
      : defaults.unitSize;

  return {
    bankroll,
    availableBankroll,
    unitSize,
    riskTolerance,
    baseKellyFraction:
      typeof value.baseKellyFraction === "number" && value.baseKellyFraction > 0
        ? Math.min(value.baseKellyFraction, 1)
        : riskTolerance === "AGGRESSIVE"
          ? 0.5
          : riskTolerance === "BALANCED"
            ? 0.35
            : defaults.baseKellyFraction,
    maxSingleBetPct:
      typeof value.maxSingleBetPct === "number" && value.maxSingleBetPct > 0
        ? value.maxSingleBetPct
        : riskTolerance === "AGGRESSIVE"
          ? 0.04
          : riskTolerance === "BALANCED"
            ? 0.03
            : defaults.maxSingleBetPct,
    maxOpenExposurePct:
      typeof value.maxOpenExposurePct === "number" && value.maxOpenExposurePct > 0
        ? value.maxOpenExposurePct
        : riskTolerance === "AGGRESSIVE"
          ? 0.2
          : riskTolerance === "BALANCED"
            ? 0.15
            : defaults.maxOpenExposurePct,
    maxEventExposurePct:
      typeof value.maxEventExposurePct === "number" && value.maxEventExposurePct > 0
        ? value.maxEventExposurePct
        : riskTolerance === "AGGRESSIVE"
          ? 0.07
          : riskTolerance === "BALANCED"
            ? 0.05
            : defaults.maxEventExposurePct,
    maxMarketExposurePct:
      typeof value.maxMarketExposurePct === "number" && value.maxMarketExposurePct > 0
        ? value.maxMarketExposurePct
        : riskTolerance === "AGGRESSIVE"
          ? 0.05
          : riskTolerance === "BALANCED"
            ? 0.04
            : defaults.maxMarketExposurePct
  };
}

export async function ensureDefaultUser() {
  return prisma.user.upsert({
    where: {
      id: DEFAULT_USER_ID
    },
    update: {
      planTier: getDefaultPlanTier(),
      subscriptionState: getDefaultSubscriptionState(),
      notificationPrefsJson: toJsonInput(buildDefaultNotificationPreferences())
    },
    create: {
      id: DEFAULT_USER_ID,
      username: "demo_bettor",
      bankrollSettingsJson: {
        unitSize: 100,
        bankroll: 5000
      },
      planTier: getDefaultPlanTier(),
      subscriptionState: getDefaultSubscriptionState(),
      notificationPrefsJson: toJsonInput(buildDefaultNotificationPreferences())
    }
  });
}

function normalizePreferences(raw: Prisma.JsonValue | null): NotificationPreferencesView {
  const defaults = buildDefaultNotificationPreferences();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }

  const value = raw as Partial<NotificationPreferencesView>;

  return {
    deliveryChannels:
      value.deliveryChannels?.includes("IN_APP") ? ["IN_APP"] : defaults.deliveryChannels,
    quietHours: {
      enabled: value.quietHours?.enabled ?? defaults.quietHours.enabled,
      startHour: value.quietHours?.startHour ?? defaults.quietHours.startHour,
      endHour: value.quietHours?.endHour ?? defaults.quietHours.endHour
    },
    sportPreferences: {
      ...defaults.sportPreferences,
      ...(value.sportPreferences ?? {})
    },
    alertTypePreferences: {
      ...defaults.alertTypePreferences,
      ...(value.alertTypePreferences ?? {})
    }
  };
}

export async function getCurrentUserProfile() {
  await ensureDefaultUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: {
      id: DEFAULT_USER_ID
    }
  });

  return {
    id: user.id,
    planTier: user.planTier as PlanTierView,
    subscriptionState: user.subscriptionState as SubscriptionStateView,
    planRenewsAt: user.planRenewsAt?.toISOString() ?? null,
    preferences: normalizePreferences(user.notificationPrefsJson)
  };
}

export async function getCurrentUserBankrollSettings(): Promise<OpportunityBankrollSettings> {
  await ensureDefaultUser();
  const user = await prisma.user.findUniqueOrThrow({
    where: {
      id: DEFAULT_USER_ID
    },
    select: {
      bankrollSettingsJson: true
    }
  });

  return normalizeBankrollSettings(user.bankrollSettingsJson);
}

export async function updateNotificationPreferences(
  preferences: NotificationPreferencesView
) {
  await ensureDefaultUser();
  await prisma.user.update({
    where: {
      id: DEFAULT_USER_ID
    },
    data: {
      notificationPrefsJson: toJsonInput(preferences)
    }
  });
}

export function getDefaultSubscriptionSummary() {
  return getSubscriptionSummary({
    planTier: getDefaultPlanTier(),
    subscriptionState: getDefaultSubscriptionState()
  });
}

export function getSubscriptionSummary(args: {
  planTier: PlanTierView;
  subscriptionState: SubscriptionStateView;
}): SubscriptionSummary {
  const isPremium = args.planTier === "PREMIUM" && args.subscriptionState === "ACTIVE";

  return {
    planTier: args.planTier,
    subscriptionState: args.subscriptionState,
    isPremium,
    statusLabel:
      args.planTier === "FREE"
        ? "Free"
        : args.subscriptionState === "ACTIVE"
          ? "Premium Active"
          : args.subscriptionState === "CANCELED"
            ? "Premium Canceled"
            : args.subscriptionState === "PAST_DUE"
              ? "Premium Past Due"
              : "Premium",
    limits: isPremium ? PREMIUM_LIMITS : FREE_LIMITS,
    gatedFeatures: isPremium
      ? []
      : [
          "advanced_alerts",
          "premium_alert_volume",
          "deep_edge_breakdown",
          "leak_detector_detail",
          "top_play_explanations",
          "import_runs_history"
        ]
  };
}

function getSetupErrorCode(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    return String(error.code);
  }

  return null;
}

function getSetupErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown database-backed product service error.";
}

export function buildProductSetupState(featureName: string, error?: unknown): ProductSetupState {
  const message = getSetupErrorMessage(error);
  const code = getSetupErrorCode(error);
  const resolution = getServerDatabaseResolution();

  if (!hasUsableServerDatabaseUrl()) {
    return {
      status: "blocked",
      title: `${featureName} database is not configured`,
      detail:
        "This runtime does not have a usable Postgres URL yet, so SharkEdge is showing an honest setup-blocked state instead of a fake empty product view.",
      steps: [
        "Set one of DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL in the server runtime.",
        "Run npx prisma migrate deploy against that database.",
        "Run npm run prisma:seed once to load starter product data."
      ]
    };
  }

  if (code === "P2021" || code === "P2022" || /does not exist|no such table|relation .* does not exist/i.test(message)) {
    return {
      status: "blocked",
      title: `${featureName} tables are missing in the database`,
      detail:
        "The app can reach Postgres, but the latest Prisma migration has not been applied yet. SharkEdge is keeping this feature in setup mode instead of falling back to stale mock states.",
      steps: [
        "Run npx prisma migrate deploy.",
        "Run npm run prisma:seed to load starter rows.",
        "Redeploy the frontend after the migration completes."
      ]
    };
  }

  if (code === "P1001" || /can't reach database server|connect|connection/i.test(message)) {
    return {
      status: "blocked",
      title: `${featureName} database is unreachable`,
      detail:
        "The runtime can resolve a database URL, but Prisma cannot connect from this environment. SharkEdge is surfacing that directly instead of pretending data is simply empty.",
      steps: [
        `Verify ${resolution.key ?? "the configured database URL"} points to the correct Postgres host.`,
        "Confirm the database accepts connections from the deployment environment.",
        "Redeploy once the connection test succeeds."
      ]
    };
  }

  return {
    status: "blocked",
    title: `${featureName} services are unavailable`,
    detail:
      "The feature is database-backed, but initialization failed. SharkEdge is keeping the state honest instead of hiding the problem behind an empty shell.",
    steps: [
      "Check deployment logs for the underlying Prisma error.",
      "Verify the DB URL and latest migration are both in place.",
      `Latest error: ${message}`
    ]
  };
}
