-- CreateTable SimulationCache
CREATE TABLE "simulation_cache" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "leagueKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "baselineSimulation" JSONB NOT NULL,
    "regimeClassification" TEXT NOT NULL,
    "regimeConfidence" DOUBLE PRECISION NOT NULL,
    "regimeReasoning" JSONB NOT NULL,
    "enhancedSimulation" JSONB NOT NULL,
    "varianceAdjustment" DOUBLE PRECISION NOT NULL,
    "simulationModel" TEXT NOT NULL DEFAULT 'v3',
    "executionTimeMs" INTEGER NOT NULL,
    "deepDiveRun" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulation_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable VerdictAbTest
CREATE TABLE "verdict_ab_tests" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "controlVerdict" JSONB NOT NULL,
    "controlConfidence" DOUBLE PRECISION NOT NULL,
    "treatmentVerdict" JSONB NOT NULL,
    "treatmentConfidence" DOUBLE PRECISION NOT NULL,
    "outcomePredictionHome" DOUBLE PRECISION,
    "outcomePredictionAway" DOUBLE PRECISION,
    "actualHomeScore" DOUBLE PRECISION,
    "actualAwayScore" DOUBLE PRECISION,
    "verdictAccuracy" DOUBLE PRECISION,
    "homeWinAccuracy" DOUBLE PRECISION,
    "spreadAccuracy" DOUBLE PRECISION,
    "totalAccuracy" DOUBLE PRECISION,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "winnerVariant" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "verdict_ab_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulation_cache_inputHash_key" ON "simulation_cache"("inputHash");

-- CreateIndex
CREATE INDEX "simulation_cache_eventId_createdAt_idx" ON "simulation_cache"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "simulation_cache_leagueKey_createdAt_idx" ON "simulation_cache"("leagueKey", "createdAt");

-- CreateIndex
CREATE INDEX "simulation_cache_regimeClassification_idx" ON "simulation_cache"("regimeClassification");

-- CreateIndex
CREATE INDEX "simulation_cache_expiresAt_idx" ON "simulation_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "verdict_ab_tests_testName_createdAt_idx" ON "verdict_ab_tests"("testName", "createdAt");

-- CreateIndex
CREATE INDEX "verdict_ab_tests_variant_resolved_idx" ON "verdict_ab_tests"("variant", "resolved");

-- CreateIndex
CREATE INDEX "verdict_ab_tests_eventId_createdAt_idx" ON "verdict_ab_tests"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "verdict_ab_tests_resolved_resolvedAt_idx" ON "verdict_ab_tests"("resolved", "resolvedAt");

-- AddForeignKey
ALTER TABLE "simulation_cache" ADD CONSTRAINT "simulation_cache_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verdict_ab_tests" ADD CONSTRAINT "verdict_ab_tests_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
