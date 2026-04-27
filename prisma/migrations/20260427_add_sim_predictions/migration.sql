-- CreateTable
CREATE TABLE "sim_predictions" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventMarketId" TEXT,
    "playerId" TEXT,
    "league" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "propType" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "line" DOUBLE PRECISION NOT NULL,
    "bookOdds" INTEGER NOT NULL,
    "simOverPct" DOUBLE PRECISION NOT NULL,
    "simUnderPct" DOUBLE PRECISION NOT NULL,
    "edgePct" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'OPEN',
    "actualValue" DOUBLE PRECISION,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sim_predictions_eventId_playerId_idx" ON "sim_predictions"("eventId", "playerId");

-- CreateIndex
CREATE INDEX "sim_predictions_result_createdAt_idx" ON "sim_predictions"("result", "createdAt");

-- CreateIndex
CREATE INDEX "sim_predictions_league_createdAt_idx" ON "sim_predictions"("league", "createdAt");
