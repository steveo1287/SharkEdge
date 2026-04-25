-- CreateTable
CREATE TABLE IF NOT EXISTS "trend_discovery_runs" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "leagues_json" JSONB,
  "historical_row_count" INTEGER NOT NULL DEFAULT 0,
  "current_row_count" INTEGER NOT NULL DEFAULT 0,
  "discovered_system_count" INTEGER NOT NULL DEFAULT 0,
  "activation_count" INTEGER NOT NULL DEFAULT 0,
  "summary_json" JSONB,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trend_discovery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "discovered_trend_systems" (
  "id" TEXT NOT NULL,
  "discovery_run_id" TEXT,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sport" TEXT NOT NULL,
  "league" TEXT NOT NULL,
  "market_type" TEXT NOT NULL,
  "side" TEXT NOT NULL,
  "tier" TEXT NOT NULL DEFAULT 'C',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "score" DOUBLE PRECISION,
  "validation_score" DOUBLE PRECISION,
  "sample_size" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "pushes" INTEGER NOT NULL DEFAULT 0,
  "hit_rate" DOUBLE PRECISION,
  "roi" DOUBLE PRECISION,
  "total_profit" DOUBLE PRECISION,
  "avg_clv" DOUBLE PRECISION,
  "beat_close_rate" DOUBLE PRECISION,
  "recent_sample_size" INTEGER NOT NULL DEFAULT 0,
  "seasons_json" JSONB,
  "warnings_json" JSONB,
  "conditions_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discovered_trend_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "discovered_trend_system_snapshots" (
  "id" TEXT NOT NULL,
  "system_id" TEXT NOT NULL,
  "sample_size" INTEGER NOT NULL DEFAULT 0,
  "wins" INTEGER NOT NULL DEFAULT 0,
  "losses" INTEGER NOT NULL DEFAULT 0,
  "pushes" INTEGER NOT NULL DEFAULT 0,
  "roi" DOUBLE PRECISION,
  "hit_rate" DOUBLE PRECISION,
  "total_profit" DOUBLE PRECISION,
  "avg_clv" DOUBLE PRECISION,
  "beat_close_rate" DOUBLE PRECISION,
  "score" DOUBLE PRECISION,
  "validation_score" DOUBLE PRECISION,
  "activation_count" INTEGER NOT NULL DEFAULT 0,
  "warnings_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discovered_trend_system_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "discovered_trend_activations" (
  "id" TEXT NOT NULL,
  "system_id" TEXT NOT NULL,
  "event_id" TEXT,
  "event_label" TEXT NOT NULL,
  "event_start_time" TIMESTAMP(3),
  "current_line" DOUBLE PRECISION,
  "current_odds" INTEGER,
  "fair_odds" INTEGER,
  "edge_pct" DOUBLE PRECISION,
  "timing_state" TEXT,
  "confidence_tier" TEXT,
  "reasons_json" JSONB,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "discovered_trend_activations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "discovered_trend_systems_slug_key" ON "discovered_trend_systems"("slug");
CREATE INDEX IF NOT EXISTS "discovered_trend_systems_league_market_type_idx" ON "discovered_trend_systems"("league", "market_type");
CREATE INDEX IF NOT EXISTS "discovered_trend_systems_tier_updated_at_idx" ON "discovered_trend_systems"("tier", "updated_at");
CREATE INDEX IF NOT EXISTS "discovered_trend_system_snapshots_system_id_created_at_idx" ON "discovered_trend_system_snapshots"("system_id", "created_at");
CREATE INDEX IF NOT EXISTS "discovered_trend_activations_system_id_is_active_idx" ON "discovered_trend_activations"("system_id", "is_active");
CREATE INDEX IF NOT EXISTS "discovered_trend_activations_event_id_created_at_idx" ON "discovered_trend_activations"("event_id", "created_at");

ALTER TABLE "discovered_trend_systems" ADD CONSTRAINT "discovered_trend_systems_discovery_run_id_fkey" FOREIGN KEY ("discovery_run_id") REFERENCES "trend_discovery_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "discovered_trend_system_snapshots" ADD CONSTRAINT "discovered_trend_system_snapshots_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "discovered_trend_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discovered_trend_activations" ADD CONSTRAINT "discovered_trend_activations_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "discovered_trend_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "discovered_trend_activations" ADD CONSTRAINT "discovered_trend_activations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE IF EXISTS "discovered_trend_systems"
  ADD COLUMN IF NOT EXISTS "teamBreakdownJson" JSONB,
  ADD COLUMN IF NOT EXISTS "opponentBreakdownJson" JSONB,
  ADD COLUMN IF NOT EXISTS "lineDistributionJson" JSONB;
