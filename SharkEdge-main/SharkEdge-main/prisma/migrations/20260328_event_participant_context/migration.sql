CREATE TABLE "event_participant_context" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'UNKNOWN',
    "previousEventId" TEXT,
    "previousOpponentId" TEXT,
    "daysRest" DOUBLE PRECISION,
    "opponentRestDays" DOUBLE PRECISION,
    "restAdvantageDays" DOUBLE PRECISION,
    "gamesLast7" INTEGER NOT NULL DEFAULT 0,
    "gamesLast14" INTEGER NOT NULL DEFAULT 0,
    "isBackToBack" BOOLEAN NOT NULL DEFAULT false,
    "siteStreak" INTEGER NOT NULL DEFAULT 0,
    "isRematch" BOOLEAN NOT NULL DEFAULT false,
    "revengeSpot" BOOLEAN NOT NULL DEFAULT false,
    "recentWinRate" DOUBLE PRECISION,
    "recentMargin" DOUBLE PRECISION,
    "scheduleDensityScore" DOUBLE PRECISION,
    "travelProxyScore" DOUBLE PRECISION,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_participant_context_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_participant_context_eventId_competitorId_key" ON "event_participant_context"("eventId", "competitorId");
CREATE INDEX "event_participant_context_competitorId_updatedAt_idx" ON "event_participant_context"("competitorId", "updatedAt");
CREATE INDEX "event_participant_context_eventId_role_idx" ON "event_participant_context"("eventId", "role");

ALTER TABLE "event_participant_context"
ADD CONSTRAINT "event_participant_context_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_participant_context"
ADD CONSTRAINT "event_participant_context_competitorId_fkey"
FOREIGN KEY ("competitorId") REFERENCES "competitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
