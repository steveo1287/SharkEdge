-- CreateTable
CREATE TABLE "saved_trend_definitions" (
    "id" TEXT NOT NULL,
    "savedTrendId" TEXT,
    "creatorId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sport" "SportCode" NOT NULL,
    "league" TEXT,
    "betType" TEXT NOT NULL,
    "filterConditionsJson" JSONB NOT NULL,
    "isSystemGenerated" BOOLEAN NOT NULL DEFAULT false,
    "isUserCreated" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isPremium" BOOLEAN NOT NULL DEFAULT false,
    "currentStatsJson" JSONB,
    "lastComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_trend_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_trend_matches" (
    "id" TEXT NOT NULL,
    "trendDefinitionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "betResult" TEXT NOT NULL,
    "unitsWon" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cumulativeProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_trend_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_trend_snapshots" (
    "id" TEXT NOT NULL,
    "trendDefinitionId" TEXT NOT NULL,
    "totalGames" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "pushes" INTEGER NOT NULL DEFAULT 0,
    "winPercentage" DOUBLE PRECISION,
    "roi" DOUBLE PRECISION,
    "totalProfit" DOUBLE PRECISION,
    "currentStreak" INTEGER,
    "streakType" TEXT,
    "pValue" DOUBLE PRECISION,
    "chiSquareStat" DOUBLE PRECISION,
    "isStatisticallySignificant" BOOLEAN NOT NULL DEFAULT false,
    "confidenceScore" DOUBLE PRECISION,
    "sampleSizeRating" TEXT,
    "warningsJson" JSONB,
    "activeGameCount" INTEGER NOT NULL DEFAULT 0,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "saved_trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saved_trend_definitions_savedTrendId_key" ON "saved_trend_definitions"("savedTrendId");

-- CreateIndex
CREATE INDEX "saved_trend_definitions_sport_isSystemGenerated_updatedAt_idx" ON "saved_trend_definitions"("sport", "isSystemGenerated", "updatedAt");
CREATE INDEX "saved_trend_definitions_league_betType_updatedAt_idx" ON "saved_trend_definitions"("league", "betType", "updatedAt");
CREATE INDEX "saved_trend_definitions_creatorId_updatedAt_idx" ON "saved_trend_definitions"("creatorId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_trend_matches_trendDefinitionId_eventId_key" ON "saved_trend_matches"("trendDefinitionId", "eventId");
CREATE INDEX "saved_trend_matches_eventId_matchedAt_idx" ON "saved_trend_matches"("eventId", "matchedAt");
CREATE INDEX "saved_trend_matches_trendDefinitionId_matchedAt_idx" ON "saved_trend_matches"("trendDefinitionId", "matchedAt");

-- CreateIndex
CREATE INDEX "saved_trend_snapshots_trendDefinitionId_calculatedAt_idx" ON "saved_trend_snapshots"("trendDefinitionId", "calculatedAt");
CREATE INDEX "saved_trend_snapshots_confidenceScore_calculatedAt_idx" ON "saved_trend_snapshots"("confidenceScore", "calculatedAt");

-- AddForeignKey
ALTER TABLE "saved_trend_definitions" ADD CONSTRAINT "saved_trend_definitions_savedTrendId_fkey" FOREIGN KEY ("savedTrendId") REFERENCES "saved_trends"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "saved_trend_definitions" ADD CONSTRAINT "saved_trend_definitions_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "saved_trend_matches" ADD CONSTRAINT "saved_trend_matches_trendDefinitionId_fkey" FOREIGN KEY ("trendDefinitionId") REFERENCES "saved_trend_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_trend_matches" ADD CONSTRAINT "saved_trend_matches_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_trend_snapshots" ADD CONSTRAINT "saved_trend_snapshots_trendDefinitionId_fkey" FOREIGN KEY ("trendDefinitionId") REFERENCES "saved_trend_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
