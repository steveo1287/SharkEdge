CREATE TABLE IF NOT EXISTS "sim_prediction_snapshots" (
    "id" TEXT NOT NULL,
    "snapshot_key" TEXT NOT NULL,
    "league" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "event_label" TEXT NOT NULL,
    "away_team" TEXT NOT NULL,
    "home_team" TEXT NOT NULL,
    "start_time" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL,
    "captured_at" TIMESTAMPTZ NOT NULL,
    "model_version" TEXT,
    "data_source" TEXT,
    "tier" TEXT,
    "no_bet" BOOLEAN DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "model_home_win_pct" DOUBLE PRECISION NOT NULL,
    "model_away_win_pct" DOUBLE PRECISION NOT NULL,
    "model_spread" DOUBLE PRECISION NOT NULL,
    "model_total" DOUBLE PRECISION NOT NULL,
    "model_home_score" DOUBLE PRECISION NOT NULL,
    "model_away_score" DOUBLE PRECISION NOT NULL,
    "market_home_win_pct" DOUBLE PRECISION,
    "market_spread" DOUBLE PRECISION,
    "market_total" DOUBLE PRECISION,
    "final_home_score" DOUBLE PRECISION,
    "final_away_score" DOUBLE PRECISION,
    "final_margin" DOUBLE PRECISION,
    "final_total" DOUBLE PRECISION,
    "home_won" BOOLEAN,
    "brier" DOUBLE PRECISION,
    "log_loss" DOUBLE PRECISION,
    "spread_error" DOUBLE PRECISION,
    "total_error" DOUBLE PRECISION,
    "calibration_bucket" TEXT,
    "prediction_json" JSONB,
    "result_json" JSONB,
    "graded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sim_prediction_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sim_prediction_snapshots_snapshot_key_key" ON "sim_prediction_snapshots"("snapshot_key");
CREATE INDEX IF NOT EXISTS "sim_prediction_snapshots_league_captured_at_idx" ON "sim_prediction_snapshots"("league", "captured_at" DESC);
CREATE INDEX IF NOT EXISTS "sim_prediction_snapshots_league_game_id_idx" ON "sim_prediction_snapshots"("league", "game_id");
CREATE INDEX IF NOT EXISTS "sim_prediction_snapshots_graded_at_start_time_idx" ON "sim_prediction_snapshots"("graded_at", "start_time");
