-- CreateTable
CREATE TABLE "opportunity_surface_records" (
    "id" TEXT NOT NULL,
    "surfaceKey" TEXT NOT NULL,
    "surfacedOpportunityId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "league" TEXT,
    "marketType" TEXT NOT NULL,
    "selection" TEXT NOT NULL,
    "surfaceContext" TEXT NOT NULL DEFAULT 'unknown',
    "surfaceRank" TEXT NOT NULL DEFAULT 'secondary',
    "isPrimarySurface" BOOLEAN NOT NULL DEFAULT false,
    "sportsbookKey" TEXT,
    "sportsbookName" TEXT,
    "displayedOddsAmerican" INTEGER,
    "displayedLine" DOUBLE PRECISION,
    "displayedLineLabel" TEXT,
    "fairPriceAmerican" INTEGER,
    "expectedValuePct" DOUBLE PRECISION,
    "surfacedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionState" TEXT NOT NULL,
    "timingState" TEXT,
    "opportunityScore" INTEGER NOT NULL,
    "confidenceTier" TEXT NOT NULL,
    "trapFlagsJson" JSONB NOT NULL,
    "sourceHealthState" TEXT,
    "marketEfficiency" TEXT,
    "sizingRecommendation" TEXT,
    "providerFreshnessMinutes" INTEGER,
    "closeOddsAmerican" INTEGER,
    "closeLine" DOUBLE PRECISION,
    "closeSportsbookKey" TEXT,
    "closeSportsbookName" TEXT,
    "closeSource" TEXT,
    "closeState" TEXT NOT NULL DEFAULT 'UNRESOLVED',
    "closeCapturedAt" TIMESTAMP(3),
    "clvAmericanDelta" INTEGER,
    "clvLineDelta" DOUBLE PRECISION,
    "clvPct" DOUBLE PRECISION,
    "clvResult" TEXT NOT NULL DEFAULT 'NO_CLOSE_DATA',
    "closeBeatEntry" BOOLEAN,
    "entryBeatCloseMaterially" BOOLEAN,
    "normalizedTruthScore" DOUBLE PRECISION,
    "closeUnavailableReason" TEXT,
    "finalOutcome" TEXT,
    "finalOutcomeCapturedAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "opportunity_surface_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "opportunity_surface_records_surfaceKey_key" ON "opportunity_surface_records"("surfaceKey");
CREATE INDEX "opportunity_surface_records_eventId_surfacedAt_idx" ON "opportunity_surface_records"("eventId", "surfacedAt");
CREATE INDEX "opportunity_surface_records_surfaceContext_surfacedAt_idx" ON "opportunity_surface_records"("surfaceContext", "surfacedAt");
CREATE INDEX "opportunity_surface_records_league_marketType_surfacedAt_idx" ON "opportunity_surface_records"("league", "marketType", "surfacedAt");
CREATE INDEX "opportunity_surface_records_sportsbookKey_surfacedAt_idx" ON "opportunity_surface_records"("sportsbookKey", "surfacedAt");
CREATE INDEX "opportunity_surface_records_timingState_surfacedAt_idx" ON "opportunity_surface_records"("timingState", "surfacedAt");
CREATE INDEX "opportunity_surface_records_actionState_surfacedAt_idx" ON "opportunity_surface_records"("actionState", "surfacedAt");
CREATE INDEX "opportunity_surface_records_confidenceTier_surfacedAt_idx" ON "opportunity_surface_records"("confidenceTier", "surfacedAt");
CREATE INDEX "opportunity_surface_records_sourceHealthState_surfacedAt_idx" ON "opportunity_surface_records"("sourceHealthState", "surfacedAt");
CREATE INDEX "opportunity_surface_records_clvResult_closeCapturedAt_idx" ON "opportunity_surface_records"("clvResult", "closeCapturedAt");
CREATE INDEX "opportunity_surface_records_closeBeatEntry_closeCapturedAt_idx" ON "opportunity_surface_records"("closeBeatEntry", "closeCapturedAt");
