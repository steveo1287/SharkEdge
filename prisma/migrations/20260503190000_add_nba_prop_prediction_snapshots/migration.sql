CREATE TABLE IF NOT EXISTS "nba_prop_prediction_snapshots" (
  "id" TEXT PRIMARY KEY,
  "event_id" TEXT,
  "game_id" TEXT,
  "player_id" TEXT,
  "player_name" TEXT NOT NULL,
  "team" TEXT,
  "opponent" TEXT,
  "stat_key" TEXT NOT NULL,
  "market_line" DOUBLE PRECISION NOT NULL,
  "market_odds_over" INTEGER,
  "market_odds_under" INTEGER,
  "predicted_mean" DOUBLE PRECISION NOT NULL,
  "predicted_median" DOUBLE PRECISION,
  "predicted_std_dev" DOUBLE PRECISION,
  "predicted_over_probability" DOUBLE PRECISION NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "minutes_confidence" DOUBLE PRECISION,
  "lineup_truth_status" TEXT,
  "player_status" TEXT,
  "prop_calibration_status" TEXT,
  "no_bet" BOOLEAN NOT NULL DEFAULT false,
  "blocker_reasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "drivers" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "game_start_time" TIMESTAMP(3),
  "closing_line" DOUBLE PRECISION,
  "closing_odds_over" INTEGER,
  "closing_odds_under" INTEGER,
  "actual_value" DOUBLE PRECISION,
  "result" TEXT,
  "graded_at" TIMESTAMP(3),
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "nba_prop_prediction_snapshots_dedupe_key"
  ON "nba_prop_prediction_snapshots" ("event_id", "player_id", "stat_key", "market_line", "captured_at");

CREATE INDEX IF NOT EXISTS "nba_prop_prediction_snapshots_stat_conf_idx"
  ON "nba_prop_prediction_snapshots" ("stat_key", "confidence", "graded_at");

CREATE INDEX IF NOT EXISTS "nba_prop_prediction_snapshots_player_event_idx"
  ON "nba_prop_prediction_snapshots" ("player_id", "event_id", "stat_key");

CREATE INDEX IF NOT EXISTS "nba_prop_prediction_snapshots_grading_idx"
  ON "nba_prop_prediction_snapshots" ("graded_at", "actual_value", "captured_at");
