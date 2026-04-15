ALTER TYPE "MarketType" ADD VALUE IF NOT EXISTS 'player_pitcher_outs';
ALTER TYPE "MarketType" ADD VALUE IF NOT EXISTS 'player_pitcher_strikeouts';

ALTER TABLE "event_markets"
  ADD COLUMN IF NOT EXISTS "playerId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'event_markets_playerId_fkey'
  ) THEN
    ALTER TABLE "event_markets"
      ADD CONSTRAINT "event_markets_playerId_fkey"
      FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "event_markets_playerId_marketType_idx"
  ON "event_markets"("playerId", "marketType");

ALTER TABLE "current_market_state"
  ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL DEFAULT 'full_game',
  ADD COLUMN IF NOT EXISTS "selectionCompetitorId" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'current_market_state_eventId_marketType_playerId_key'
  ) THEN
    ALTER TABLE "current_market_state"
      DROP CONSTRAINT "current_market_state_eventId_marketType_playerId_key";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'current_market_state_selectionCompetitorId_fkey'
  ) THEN
    ALTER TABLE "current_market_state"
      ADD CONSTRAINT "current_market_state_selectionCompetitorId_fkey"
      FOREIGN KEY ("selectionCompetitorId") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "current_market_state_event_market_period_selection_player_key"
  ON "current_market_state"("eventId", "marketType", "period", "selectionCompetitorId", "playerId");
CREATE INDEX IF NOT EXISTS "current_market_state_selectionCompetitorId_updatedAt_idx"
  ON "current_market_state"("selectionCompetitorId", "updatedAt");

ALTER TABLE "edge_signals"
  ADD COLUMN IF NOT EXISTS "period" TEXT NOT NULL DEFAULT 'full_game',
  ADD COLUMN IF NOT EXISTS "selectionCompetitorId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'edge_signals_selectionCompetitorId_fkey'
  ) THEN
    ALTER TABLE "edge_signals"
      ADD CONSTRAINT "edge_signals_selectionCompetitorId_fkey"
      FOREIGN KEY ("selectionCompetitorId") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "edge_signals_selectionCompetitorId_createdAt_idx"
  ON "edge_signals"("selectionCompetitorId", "createdAt");
