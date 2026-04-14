CREATE TABLE "event_results" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "winnerCompetitorId" TEXT,
    "loserCompetitorId" TEXT,
    "winningSide" TEXT,
    "method" TEXT,
    "period" TEXT,
    "margin" DOUBLE PRECISION,
    "totalPoints" DOUBLE PRECISION,
    "participantResultsJson" JSONB NOT NULL,
    "metadataJson" JSONB,
    "officialAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_results_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_results_eventId_key" ON "event_results"("eventId");
CREATE INDEX "event_results_winnerCompetitorId_officialAt_idx" ON "event_results"("winnerCompetitorId", "officialAt");
CREATE INDEX "event_results_loserCompetitorId_officialAt_idx" ON "event_results"("loserCompetitorId", "officialAt");
CREATE INDEX "event_results_officialAt_idx" ON "event_results"("officialAt");

ALTER TABLE "event_results"
ADD CONSTRAINT "event_results_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "events"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_results"
ADD CONSTRAINT "event_results_winnerCompetitorId_fkey"
FOREIGN KEY ("winnerCompetitorId") REFERENCES "competitors"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_results"
ADD CONSTRAINT "event_results_loserCompetitorId_fkey"
FOREIGN KEY ("loserCompetitorId") REFERENCES "competitors"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
