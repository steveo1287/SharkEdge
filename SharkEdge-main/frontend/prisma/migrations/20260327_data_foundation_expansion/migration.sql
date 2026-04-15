-- Additive warehouse expansion for SharkEdge's existing normalized graph.

ALTER TABLE "leagues"
  ADD COLUMN IF NOT EXISTS "level" TEXT,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "teams"
  ADD COLUMN IF NOT EXISTS "key" TEXT,
  ADD COLUMN IF NOT EXISTS "city" TEXT,
  ADD COLUMN IF NOT EXISTS "nickname" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "teams_key_key" ON "teams"("key");

ALTER TABLE "players"
  ADD COLUMN IF NOT EXISTS "key" TEXT,
  ADD COLUMN IF NOT EXISTS "firstName" TEXT,
  ADD COLUMN IF NOT EXISTS "lastName" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "players_key_key" ON "players"("key");

ALTER TABLE "sportsbooks"
  ADD COLUMN IF NOT EXISTS "type" TEXT;

ALTER TABLE "injuries"
  ADD COLUMN IF NOT EXISTS "leagueId" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "effectiveAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "metadataJson" JSONB;

CREATE INDEX IF NOT EXISTS "injuries_playerId_updatedAt_idx" ON "injuries"("playerId", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'injuries_leagueId_fkey'
  ) THEN
    ALTER TABLE "injuries"
      ADD CONSTRAINT "injuries_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "leagues"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "team_aliases" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "team_aliases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "team_aliases_teamId_idx" ON "team_aliases"("teamId");
CREATE UNIQUE INDEX IF NOT EXISTS "team_aliases_source_normalizedAlias_key" ON "team_aliases"("source", "normalizedAlias");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_aliases_teamId_fkey'
  ) THEN
    ALTER TABLE "team_aliases"
      ADD CONSTRAINT "team_aliases_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "teams"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "player_aliases" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "player_aliases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "player_aliases_playerId_idx" ON "player_aliases"("playerId");
CREATE UNIQUE INDEX IF NOT EXISTS "player_aliases_source_normalizedAlias_key" ON "player_aliases"("source", "normalizedAlias");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'player_aliases_playerId_fkey'
  ) THEN
    ALTER TABLE "player_aliases"
      ADD CONSTRAINT "player_aliases_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "players"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "model_runs" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "version" TEXT,
  "scope" TEXT,
  "status" TEXT,
  "metadataJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "model_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "model_runs_key_key" ON "model_runs"("key");
CREATE INDEX IF NOT EXISTS "model_runs_modelName_createdAt_idx" ON "model_runs"("modelName", "createdAt");

CREATE TABLE IF NOT EXISTS "current_market_state" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "marketType" "MarketType" NOT NULL,
  "playerId" TEXT,
  "consensusLineValue" DOUBLE PRECISION,
  "bestHomeOddsAmerican" INTEGER,
  "bestHomeBookId" TEXT,
  "bestAwayOddsAmerican" INTEGER,
  "bestAwayBookId" TEXT,
  "bestOverOddsAmerican" INTEGER,
  "bestOverBookId" TEXT,
  "bestUnderOddsAmerican" INTEGER,
  "bestUnderBookId" TEXT,
  "noVigSource" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "current_market_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "current_market_state_eventId_marketType_playerId_key" ON "current_market_state"("eventId", "marketType", "playerId");
CREATE INDEX IF NOT EXISTS "current_market_state_eventId_updatedAt_idx" ON "current_market_state"("eventId", "updatedAt");
CREATE INDEX IF NOT EXISTS "current_market_state_playerId_updatedAt_idx" ON "current_market_state"("playerId", "updatedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'current_market_state_eventId_fkey') THEN
    ALTER TABLE "current_market_state"
      ADD CONSTRAINT "current_market_state_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'current_market_state_playerId_fkey') THEN
    ALTER TABLE "current_market_state"
      ADD CONSTRAINT "current_market_state_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "players"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'current_market_state_bestHomeBookId_fkey') THEN
    ALTER TABLE "current_market_state"
      ADD CONSTRAINT "current_market_state_bestHomeBookId_fkey"
      FOREIGN KEY ("bestHomeBookId") REFERENCES "sportsbooks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'current_market_state_bestAwayBookId_fkey') THEN
    ALTER TABLE "current_market_state"
      ADD CONSTRAINT "current_market_state_bestAwayBookId_fkey"
      FOREIGN KEY ("bestAwayBookId") REFERENCES "sportsbooks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'current_market_state_bestOverBookId_fkey') THEN
    ALTER TABLE "current_market_state"
      ADD CONSTRAINT "current_market_state_bestOverBookId_fkey"
      FOREIGN KEY ("bestOverBookId") REFERENCES "sportsbooks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'current_market_state_bestUnderBookId_fkey') THEN
    ALTER TABLE "current_market_state"
      ADD CONSTRAINT "current_market_state_bestUnderBookId_fkey"
      FOREIGN KEY ("bestUnderBookId") REFERENCES "sportsbooks"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "event_projections" (
  "id" TEXT NOT NULL,
  "modelRunId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "projectedHomeScore" DOUBLE PRECISION,
  "projectedAwayScore" DOUBLE PRECISION,
  "projectedTotal" DOUBLE PRECISION,
  "projectedSpreadHome" DOUBLE PRECISION,
  "winProbHome" DOUBLE PRECISION,
  "winProbAway" DOUBLE PRECISION,
  "metadataJson" JSONB,
  CONSTRAINT "event_projections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_projections_modelRunId_eventId_key" ON "event_projections"("modelRunId", "eventId");
CREATE INDEX IF NOT EXISTS "event_projections_eventId_idx" ON "event_projections"("eventId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_projections_modelRunId_fkey') THEN
    ALTER TABLE "event_projections"
      ADD CONSTRAINT "event_projections_modelRunId_fkey"
      FOREIGN KEY ("modelRunId") REFERENCES "model_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_projections_eventId_fkey') THEN
    ALTER TABLE "event_projections"
      ADD CONSTRAINT "event_projections_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "player_projections" (
  "id" TEXT NOT NULL,
  "modelRunId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "statKey" TEXT NOT NULL,
  "meanValue" DOUBLE PRECISION NOT NULL,
  "medianValue" DOUBLE PRECISION,
  "stdDev" DOUBLE PRECISION,
  "hitProbOver" JSONB,
  "hitProbUnder" JSONB,
  "metadataJson" JSONB,
  CONSTRAINT "player_projections_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "player_projections_eventId_playerId_statKey_idx" ON "player_projections"("eventId", "playerId", "statKey");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_projections_modelRunId_fkey') THEN
    ALTER TABLE "player_projections"
      ADD CONSTRAINT "player_projections_modelRunId_fkey"
      FOREIGN KEY ("modelRunId") REFERENCES "model_runs"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_projections_eventId_fkey') THEN
    ALTER TABLE "player_projections"
      ADD CONSTRAINT "player_projections_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_projections_playerId_fkey') THEN
    ALTER TABLE "player_projections"
      ADD CONSTRAINT "player_projections_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "players"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "edge_signals" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "marketType" "MarketType" NOT NULL,
  "playerId" TEXT,
  "sportsbookId" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "lineValue" DOUBLE PRECISION,
  "offeredOddsAmerican" INTEGER NOT NULL,
  "fairOddsAmerican" INTEGER,
  "modelProb" DOUBLE PRECISION NOT NULL,
  "noVigProb" DOUBLE PRECISION,
  "evPercent" DOUBLE PRECISION NOT NULL,
  "kellyFull" DOUBLE PRECISION,
  "kellyHalf" DOUBLE PRECISION,
  "confidenceScore" DOUBLE PRECISION,
  "edgeScore" DOUBLE PRECISION,
  "flagsJson" JSONB NOT NULL,
  "modelRunId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadataJson" JSONB,
  CONSTRAINT "edge_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "edge_signals_isActive_createdAt_idx" ON "edge_signals"("isActive", "createdAt");
CREATE INDEX IF NOT EXISTS "edge_signals_edgeScore_evPercent_idx" ON "edge_signals"("edgeScore", "evPercent");
CREATE INDEX IF NOT EXISTS "edge_signals_eventId_createdAt_idx" ON "edge_signals"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "edge_signals_playerId_createdAt_idx" ON "edge_signals"("playerId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'edge_signals_eventId_fkey') THEN
    ALTER TABLE "edge_signals"
      ADD CONSTRAINT "edge_signals_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'edge_signals_playerId_fkey') THEN
    ALTER TABLE "edge_signals"
      ADD CONSTRAINT "edge_signals_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "players"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'edge_signals_sportsbookId_fkey') THEN
    ALTER TABLE "edge_signals"
      ADD CONSTRAINT "edge_signals_sportsbookId_fkey"
      FOREIGN KEY ("sportsbookId") REFERENCES "sportsbooks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'edge_signals_modelRunId_fkey') THEN
    ALTER TABLE "edge_signals"
      ADD CONSTRAINT "edge_signals_modelRunId_fkey"
      FOREIGN KEY ("modelRunId") REFERENCES "model_runs"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "line_movements" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "marketType" "MarketType" NOT NULL,
  "sportsbookId" TEXT NOT NULL,
  "playerId" TEXT,
  "side" TEXT NOT NULL,
  "lineValue" DOUBLE PRECISION,
  "oldOddsAmerican" INTEGER,
  "newOddsAmerican" INTEGER,
  "oldLineValue" DOUBLE PRECISION,
  "newLineValue" DOUBLE PRECISION,
  "movedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "movementType" TEXT,
  "metadataJson" JSONB,
  CONSTRAINT "line_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "line_movements_eventId_movedAt_idx" ON "line_movements"("eventId", "movedAt");
CREATE INDEX IF NOT EXISTS "line_movements_playerId_movedAt_idx" ON "line_movements"("playerId", "movedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_movements_eventId_fkey') THEN
    ALTER TABLE "line_movements"
      ADD CONSTRAINT "line_movements_eventId_fkey"
      FOREIGN KEY ("eventId") REFERENCES "events"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_movements_sportsbookId_fkey') THEN
    ALTER TABLE "line_movements"
      ADD CONSTRAINT "line_movements_sportsbookId_fkey"
      FOREIGN KEY ("sportsbookId") REFERENCES "sportsbooks"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'line_movements_playerId_fkey') THEN
    ALTER TABLE "line_movements"
      ADD CONSTRAINT "line_movements_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "players"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "alert_subscriptions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sportId" TEXT,
  "leagueId" TEXT,
  "marketType" "MarketType",
  "minEvPercent" DOUBLE PRECISION,
  "minConfidenceScore" DOUBLE PRECISION,
  "playerId" TEXT,
  "teamId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson" JSONB,
  CONSTRAINT "alert_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "alert_subscriptions_userId_isActive_idx" ON "alert_subscriptions"("userId", "isActive");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_subscriptions_userId_fkey') THEN
    ALTER TABLE "alert_subscriptions"
      ADD CONSTRAINT "alert_subscriptions_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_subscriptions_sportId_fkey') THEN
    ALTER TABLE "alert_subscriptions"
      ADD CONSTRAINT "alert_subscriptions_sportId_fkey"
      FOREIGN KEY ("sportId") REFERENCES "sports"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_subscriptions_leagueId_fkey') THEN
    ALTER TABLE "alert_subscriptions"
      ADD CONSTRAINT "alert_subscriptions_leagueId_fkey"
      FOREIGN KEY ("leagueId") REFERENCES "leagues"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_subscriptions_playerId_fkey') THEN
    ALTER TABLE "alert_subscriptions"
      ADD CONSTRAINT "alert_subscriptions_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "players"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'alert_subscriptions_teamId_fkey') THEN
    ALTER TABLE "alert_subscriptions"
      ADD CONSTRAINT "alert_subscriptions_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES "teams"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
