CREATE TYPE "WatchlistItemStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AlertType" AS ENUM (
  'LINE_MOVEMENT_THRESHOLD',
  'EV_THRESHOLD_REACHED',
  'BEST_BOOK_CHANGED',
  'STARTING_SOON',
  'AVAILABILITY_RETURNED',
  'TARGET_NUMBER_CROSSED',
  'PROP_LINE_CHANGED',
  'CLV_TREND'
);
CREATE TYPE "AlertRuleStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'MUTED');
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'ACTION', 'PREMIUM', 'CRITICAL');
CREATE TYPE "ImportSourceType" AS ENUM ('CSV');
CREATE TYPE "ImportBatchStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "ImportRowStatus" AS ENUM ('IMPORTED', 'DUPLICATE', 'FAILED');
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PREMIUM');
CREATE TYPE "SubscriptionState" AS ENUM ('NONE', 'ACTIVE', 'CANCELED', 'PAST_DUE');

ALTER TABLE "users"
ADD COLUMN "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
ADD COLUMN "subscriptionState" "SubscriptionState" NOT NULL DEFAULT 'NONE',
ADD COLUMN "planRenewsAt" TIMESTAMP(3),
ADD COLUMN "notificationPrefsJson" JSONB;

ALTER TABLE "bets"
ADD COLUMN "externalSourceKey" TEXT,
ADD COLUMN "externalSourceId" TEXT,
ADD COLUMN "externalSourceFingerprint" TEXT;

CREATE TABLE "watchlist_items" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sport" "SportCode" NOT NULL,
  "league" TEXT NOT NULL,
  "eventId" TEXT,
  "eventExternalId" TEXT,
  "eventLabel" TEXT NOT NULL,
  "marketType" "MarketType" NOT NULL,
  "marketLabel" TEXT NOT NULL,
  "selection" TEXT NOT NULL,
  "side" TEXT,
  "line" DOUBLE PRECISION,
  "oddsAmerican" INTEGER NOT NULL,
  "sportsbookId" TEXT,
  "sportsbookName" TEXT,
  "sourcePage" TEXT NOT NULL,
  "sourcePath" TEXT NOT NULL,
  "supportStatus" TEXT,
  "supportNote" TEXT,
  "isLive" BOOLEAN NOT NULL DEFAULT false,
  "intentJson" JSONB NOT NULL,
  "contextJson" JSONB,
  "status" "WatchlistItemStatus" NOT NULL DEFAULT 'ACTIVE',
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_rules" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "watchlistItemId" TEXT,
  "eventId" TEXT,
  "eventExternalId" TEXT,
  "type" "AlertType" NOT NULL,
  "status" "AlertRuleStatus" NOT NULL DEFAULT 'ACTIVE',
  "name" TEXT NOT NULL,
  "sport" "SportCode" NOT NULL,
  "league" TEXT NOT NULL,
  "marketType" "MarketType",
  "marketLabel" TEXT,
  "selection" TEXT,
  "configJson" JSONB NOT NULL,
  "evaluationStateJson" JSONB,
  "lastEvaluatedAt" TIMESTAMP(3),
  "lastTriggeredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "alert_notifications" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "alertRuleId" TEXT,
  "watchlistItemId" TEXT,
  "severity" "AlertSeverity" NOT NULL DEFAULT 'INFO',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sourcePage" TEXT,
  "sourcePath" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "contextJson" JSONB,
  "readAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "alert_notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_batches" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "sourceType" "ImportSourceType" NOT NULL DEFAULT 'CSV',
  "fileName" TEXT,
  "status" "ImportBatchStatus" NOT NULL DEFAULT 'PENDING',
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "importedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "summaryJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "import_rows" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowIndex" INTEGER NOT NULL,
  "providerKey" TEXT NOT NULL,
  "externalId" TEXT,
  "fingerprint" TEXT NOT NULL,
  "status" "ImportRowStatus" NOT NULL,
  "error" TEXT,
  "rawJson" JSONB NOT NULL,
  "metadataJson" JSONB,
  "betId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bets_externalSourceKey_externalSourceId_key" ON "bets"("externalSourceKey", "externalSourceId");
CREATE INDEX "bets_externalSourceFingerprint_idx" ON "bets"("externalSourceFingerprint");

CREATE INDEX "watchlist_items_userId_status_createdAt_idx" ON "watchlist_items"("userId", "status", "createdAt");
CREATE INDEX "watchlist_items_userId_sport_league_idx" ON "watchlist_items"("userId", "sport", "league");
CREATE INDEX "watchlist_items_eventId_status_idx" ON "watchlist_items"("eventId", "status");

CREATE INDEX "alert_rules_userId_status_createdAt_idx" ON "alert_rules"("userId", "status", "createdAt");
CREATE INDEX "alert_rules_watchlistItemId_status_idx" ON "alert_rules"("watchlistItemId", "status");
CREATE INDEX "alert_rules_eventId_status_idx" ON "alert_rules"("eventId", "status");

CREATE UNIQUE INDEX "alert_notifications_userId_dedupeKey_key" ON "alert_notifications"("userId", "dedupeKey");
CREATE INDEX "alert_notifications_userId_readAt_dismissedAt_createdAt_idx" ON "alert_notifications"("userId", "readAt", "dismissedAt", "createdAt");
CREATE INDEX "alert_notifications_alertRuleId_createdAt_idx" ON "alert_notifications"("alertRuleId", "createdAt");

CREATE INDEX "import_batches_userId_createdAt_idx" ON "import_batches"("userId", "createdAt");
CREATE INDEX "import_batches_providerKey_createdAt_idx" ON "import_batches"("providerKey", "createdAt");

CREATE UNIQUE INDEX "import_rows_batchId_rowIndex_key" ON "import_rows"("batchId", "rowIndex");
CREATE INDEX "import_rows_providerKey_externalId_idx" ON "import_rows"("providerKey", "externalId");
CREATE INDEX "import_rows_fingerprint_idx" ON "import_rows"("fingerprint");

ALTER TABLE "watchlist_items"
ADD CONSTRAINT "watchlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "watchlist_items"
ADD CONSTRAINT "watchlist_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "watchlist_items"
ADD CONSTRAINT "watchlist_items_sportsbookId_fkey" FOREIGN KEY ("sportsbookId") REFERENCES "sportsbooks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "alert_rules"
ADD CONSTRAINT "alert_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_rules"
ADD CONSTRAINT "alert_rules_watchlistItemId_fkey" FOREIGN KEY ("watchlistItemId") REFERENCES "watchlist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alert_rules"
ADD CONSTRAINT "alert_rules_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "alert_notifications"
ADD CONSTRAINT "alert_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "alert_notifications"
ADD CONSTRAINT "alert_notifications_alertRuleId_fkey" FOREIGN KEY ("alertRuleId") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "alert_notifications"
ADD CONSTRAINT "alert_notifications_watchlistItemId_fkey" FOREIGN KEY ("watchlistItemId") REFERENCES "watchlist_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "import_batches"
ADD CONSTRAINT "import_batches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_rows"
ADD CONSTRAINT "import_rows_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "import_rows"
ADD CONSTRAINT "import_rows_betId_fkey" FOREIGN KEY ("betId") REFERENCES "bets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
