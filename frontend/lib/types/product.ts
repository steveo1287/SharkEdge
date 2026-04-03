import type { BetIntent, PremiumGateKey } from "@/lib/types/bet-intelligence";
import type {
  BoardSupportStatus,
  GameStatus,
  LeagueKey,
  MarketType
} from "@/lib/types/domain";
import type {
  LedgerBetView,
  SupportedSportCode
} from "@/lib/types/ledger";

export const PLAN_TIERS = ["FREE", "PREMIUM"] as const;
export const SUBSCRIPTION_STATES = ["NONE", "ACTIVE", "CANCELED", "PAST_DUE"] as const;
export const WATCHLIST_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export const ALERT_TYPES = [
  "LINE_MOVEMENT_THRESHOLD",
  "EV_THRESHOLD_REACHED",
  "BEST_BOOK_CHANGED",
  "STARTING_SOON",
  "AVAILABILITY_RETURNED",
  "TARGET_NUMBER_CROSSED",
  "PROP_LINE_CHANGED",
  "CLV_TREND"
] as const;
export const ALERT_RULE_STATUSES = ["ACTIVE", "INACTIVE", "MUTED"] as const;
export const ALERT_SEVERITIES = ["INFO", "ACTION", "PREMIUM", "CRITICAL"] as const;
export const ALERT_DELIVERY_CHANNELS = ["IN_APP"] as const;
export const IMPORT_PROVIDER_KEYS = ["draftkings", "fanduel", "generic"] as const;
export const IMPORT_BATCH_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;
export const IMPORT_ROW_STATUSES = ["IMPORTED", "DUPLICATE", "FAILED"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];
export type SubscriptionState = (typeof SUBSCRIPTION_STATES)[number];
export type WatchlistStatus = (typeof WATCHLIST_STATUSES)[number];
export type AlertType = (typeof ALERT_TYPES)[number];
export type AlertRuleStatus = (typeof ALERT_RULE_STATUSES)[number];
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];
export type AlertDeliveryChannel = (typeof ALERT_DELIVERY_CHANNELS)[number];
export type ImportProviderKey = (typeof IMPORT_PROVIDER_KEYS)[number];
export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number];
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number];

export type ProductSetupState = {
  status: "blocked";
  title: string;
  detail: string;
  steps: string[];
};

export type PremiumEntitlementKey =
  | PremiumGateKey
  | "advanced_alerts"
  | "premium_alert_volume"
  | "import_runs_history";

export type SubscriptionSummary = {
  planTier: PlanTier;
  subscriptionState: SubscriptionState;
  isPremium: boolean;
  statusLabel: string;
  limits: {
    watchlistItems: number;
    activeAlerts: number;
    topPlaysVisible: number;
  };
  gatedFeatures: PremiumEntitlementKey[];
};

export type NotificationPreferencesView = {
  deliveryChannels: AlertDeliveryChannel[];
  quietHours: {
    enabled: boolean;
    startHour: number;
    endHour: number;
  };
  sportPreferences: Record<LeagueKey, boolean>;
  alertTypePreferences: Record<AlertType, boolean>;
};

export type WatchlistItemView = {
  id: string;
  savedAt: string;
  archivedAt: string | null;
  sport: SupportedSportCode;
  league: LeagueKey;
  eventId: string | null;
  eventExternalId: string | null;
  eventLabel: string;
  marketType: MarketType;
  marketLabel: string;
  selection: string;
  side: string | null;
  line: number | null;
  oddsAmerican: number;
  sportsbookName: string | null;
  sourcePage: string;
  sourcePath: string;
  supportStatus: BoardSupportStatus | null;
  supportNote: string | null;
  isLive: boolean;
  status: WatchlistStatus;
  intent: BetIntent;
  current: {
    available: boolean;
    stale: boolean;
    eventStatus: GameStatus | null;
    stateDetail: string | null;
    scoreboard: string | null;
    startTime: string | null;
    sportsbookName: string | null;
    oddsAmerican: number | null;
    line: number | null;
    expectedValuePct: number | null;
    bestBookChanged: boolean;
    note: string;
  };
  alertCount: number;
};

export type WatchlistFilters = {
  sport: "ALL" | SupportedSportCode;
  league: "ALL" | LeagueKey;
  market: "ALL" | MarketType;
  liveStatus: "all" | "live" | "upcoming" | "final" | "unavailable";
  status: "ACTIVE" | "ARCHIVED";
};

export type WatchlistPageData = {
  setup: ProductSetupState | null;
  filters: WatchlistFilters;
  items: WatchlistItemView[];
  summary: {
    total: number;
    live: number;
    upcoming: number;
    unavailable: number;
  };
  plan: SubscriptionSummary;
};

export type AlertRuleConfig =
  | {
      type: "LINE_MOVEMENT_THRESHOLD" | "PROP_LINE_CHANGED";
      threshold: number;
    }
  | {
      type: "EV_THRESHOLD_REACHED";
      thresholdPct: number;
    }
  | {
      type: "BEST_BOOK_CHANGED";
    }
  | {
      type: "STARTING_SOON";
      minutesBefore: number;
    }
  | {
      type: "AVAILABILITY_RETURNED";
    }
  | {
      type: "TARGET_NUMBER_CROSSED";
      targetLine: number;
    }
  | {
      type: "CLV_TREND";
      thresholdPct: number;
    };

export type AlertRuleView = {
  id: string;
  watchlistItemId: string | null;
  type: AlertType;
  status: AlertRuleStatus;
  name: string;
  sport: SupportedSportCode;
  league: LeagueKey;
  eventLabel: string | null;
  marketLabel: string | null;
  selection: string | null;
  config: AlertRuleConfig;
  lastEvaluatedAt: string | null;
  lastTriggeredAt: string | null;
  premiumRequired: boolean;
};

export type AlertNotificationView = {
  id: string;
  alertRuleId: string | null;
  watchlistItemId: string | null;
  severity: AlertSeverity;
  title: string;
  body: string;
  sourcePath: string | null;
  sourcePage: string | null;
  createdAt: string;
  readAt: string | null;
  dismissedAt: string | null;
  eventLabel: string | null;
  selection: string | null;
  betIntent: BetIntent | null;
};

export type AlertsPageData = {
  setup: ProductSetupState | null;
  notifications: AlertNotificationView[];
  rules: AlertRuleView[];
  unreadCount: number;
  activeRuleCount: number;
  inAppOnly: boolean;
  plan: SubscriptionSummary;
};

export type ImportBatchView = {
  id: string;
  providerKey: ImportProviderKey | string;
  fileName: string | null;
  status: ImportBatchStatus;
  rowCount: number;
  importedCount: number;
  duplicateCount: number;
  failedCount: number;
  createdAt: string;
  summary: {
    newBets: number;
    duplicates: number;
    failed: number;
  };
};

export type ImportRowOutcome = {
  rowIndex: number;
  status: ImportRowStatus;
  message: string;
  externalId: string | null;
};

export type ImportResultView = {
  batch: ImportBatchView;
  outcomes: ImportRowOutcome[];
};

export type ImportPageData = {
  setup: ProductSetupState | null;
  batches: ImportBatchView[];
  supportedProviders: Array<{
    key: ImportProviderKey;
    label: string;
    note: string;
  }>;
  plan: SubscriptionSummary;
};

export type ProductSummaryView = {
  watchlistCount: number;
  unreadAlertCount: number;
  plan: SubscriptionSummary;
};

export type PreferencesPageData = {
  setup: ProductSetupState | null;
  plan: SubscriptionSummary;
  preferences: NotificationPreferencesView;
};

export type SavedPlayContext = {
  watchlistItem: WatchlistItemView;
  ledgerBet: LedgerBetView | null;
};
