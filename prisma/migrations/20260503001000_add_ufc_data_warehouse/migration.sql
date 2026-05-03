-- UFC Fight IQ data warehouse.
-- Tables are intentionally snapshot-oriented so historical model inputs can be frozen before fight time.

CREATE TABLE IF NOT EXISTS ufc_fighters (
  id TEXT PRIMARY KEY,
  external_key TEXT UNIQUE,
  full_name TEXT NOT NULL,
  stance TEXT,
  height_inches DOUBLE PRECISION,
  reach_inches DOUBLE PRECISION,
  combat_base TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ufc_fighters_name_idx ON ufc_fighters (full_name);

CREATE TABLE IF NOT EXISTS ufc_fights (
  id TEXT PRIMARY KEY,
  external_fight_id TEXT UNIQUE,
  event_label TEXT NOT NULL,
  fight_date TIMESTAMPTZ NOT NULL,
  weight_class TEXT,
  scheduled_rounds INTEGER NOT NULL DEFAULT 3,
  fighter_a_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE RESTRICT,
  fighter_b_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE RESTRICT,
  winner_fighter_id TEXT REFERENCES ufc_fighters(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  pre_fight_snapshot_at TIMESTAMPTZ,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ufc_fights_distinct_fighters_chk CHECK (fighter_a_id <> fighter_b_id),
  CONSTRAINT ufc_fights_rounds_chk CHECK (scheduled_rounds IN (3, 5)),
  CONSTRAINT ufc_fights_snapshot_no_future_chk CHECK (pre_fight_snapshot_at IS NULL OR pre_fight_snapshot_at <= fight_date)
);
CREATE INDEX IF NOT EXISTS ufc_fights_date_idx ON ufc_fights (fight_date);
CREATE INDEX IF NOT EXISTS ufc_fights_status_idx ON ufc_fights (status, fight_date);

CREATE TABLE IF NOT EXISTS ufc_fight_stats_rounds (
  id TEXT PRIMARY KEY,
  fight_id TEXT NOT NULL REFERENCES ufc_fights(id) ON DELETE CASCADE,
  fighter_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  opponent_fighter_id TEXT REFERENCES ufc_fighters(id) ON DELETE SET NULL,
  round_number INTEGER NOT NULL,
  seconds_fought INTEGER,
  sig_strikes_landed INTEGER NOT NULL DEFAULT 0,
  sig_strikes_attempted INTEGER NOT NULL DEFAULT 0,
  sig_strikes_absorbed INTEGER NOT NULL DEFAULT 0,
  takedowns_landed INTEGER NOT NULL DEFAULT 0,
  takedowns_attempted INTEGER NOT NULL DEFAULT 0,
  submission_attempts INTEGER NOT NULL DEFAULT 0,
  control_seconds INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ufc_fight_stats_rounds_round_chk CHECK (round_number BETWEEN 1 AND 5)
);
CREATE UNIQUE INDEX IF NOT EXISTS ufc_fight_stats_rounds_unique_idx ON ufc_fight_stats_rounds (fight_id, fighter_id, round_number);

CREATE TABLE IF NOT EXISTS ufc_fighter_ratings (
  id TEXT PRIMARY KEY,
  fighter_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  fight_id TEXT REFERENCES ufc_fights(id) ON DELETE SET NULL,
  rating_system TEXT NOT NULL DEFAULT 'elo_bradley_terry',
  as_of TIMESTAMPTZ NOT NULL,
  pre_fight_rating DOUBLE PRECISION NOT NULL,
  post_fight_rating DOUBLE PRECISION,
  expected_win_probability DOUBLE PRECISION,
  actual_result DOUBLE PRECISION,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ufc_fighter_ratings_idx ON ufc_fighter_ratings (fighter_id, rating_system, as_of);

CREATE TABLE IF NOT EXISTS ufc_opponent_strength_snapshots (
  id TEXT PRIMARY KEY,
  fighter_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  as_of TIMESTAMPTZ NOT NULL,
  fights_included INTEGER NOT NULL DEFAULT 0,
  avg_opponent_rating DOUBLE PRECISION,
  opponent_strength_score DOUBLE PRECISION,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ufc_opponent_strength_unique_idx ON ufc_opponent_strength_snapshots (fighter_id, as_of);

CREATE TABLE IF NOT EXISTS ufc_amateur_results (
  id TEXT PRIMARY KEY,
  fighter_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  external_result_id TEXT UNIQUE,
  result_date TIMESTAMPTZ,
  opponent_name TEXT,
  result TEXT,
  method TEXT,
  promotion TEXT,
  promotion_tier TEXT,
  opponent_strength_score DOUBLE PRECISION,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ufc_amateur_results_idx ON ufc_amateur_results (fighter_id, result_date);

CREATE TABLE IF NOT EXISTS ufc_prospect_notes (
  id TEXT PRIMARY KEY,
  fighter_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  note_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  author TEXT,
  combat_base TEXT,
  promotion_tier TEXT,
  confidence_cap DOUBLE PRECISION,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  note TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ufc_prospect_notes_idx ON ufc_prospect_notes (fighter_id, note_date);

CREATE TABLE IF NOT EXISTS ufc_model_features (
  id TEXT PRIMARY KEY,
  fight_id TEXT NOT NULL REFERENCES ufc_fights(id) ON DELETE CASCADE,
  fight_date TIMESTAMPTZ NOT NULL,
  fighter_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  opponent_fighter_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  snapshot_at TIMESTAMPTZ NOT NULL,
  model_version TEXT NOT NULL,
  pro_fights INTEGER,
  ufc_fights INTEGER,
  rounds_fought DOUBLE PRECISION,
  sig_strikes_landed_per_min DOUBLE PRECISION,
  sig_strikes_absorbed_per_min DOUBLE PRECISION,
  striking_differential DOUBLE PRECISION,
  takedowns_per_15 DOUBLE PRECISION,
  takedown_defense_pct DOUBLE PRECISION,
  submission_attempts_per_15 DOUBLE PRECISION,
  control_time_pct DOUBLE PRECISION,
  opponent_adjusted_strength DOUBLE PRECISION,
  cold_start_active BOOLEAN NOT NULL DEFAULT false,
  feature_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ufc_model_features_snapshot_no_future_chk CHECK (snapshot_at <= fight_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS ufc_model_features_unique_idx ON ufc_model_features (fight_id, fighter_id, model_version);
CREATE INDEX IF NOT EXISTS ufc_model_features_snapshot_idx ON ufc_model_features (fighter_id, snapshot_at);

CREATE TABLE IF NOT EXISTS ufc_predictions (
  id TEXT PRIMARY KEY,
  fight_id TEXT NOT NULL REFERENCES ufc_fights(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  fighter_a_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  fighter_b_id TEXT NOT NULL REFERENCES ufc_fighters(id) ON DELETE CASCADE,
  fighter_a_win_probability DOUBLE PRECISION NOT NULL,
  fighter_b_win_probability DOUBLE PRECISION NOT NULL,
  pick_fighter_id TEXT REFERENCES ufc_fighters(id) ON DELETE SET NULL,
  fair_odds_american INTEGER,
  sportsbook_odds_american INTEGER,
  edge_pct DOUBLE PRECISION,
  ko_tko_probability DOUBLE PRECISION,
  submission_probability DOUBLE PRECISION,
  decision_probability DOUBLE PRECISION,
  prediction_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ufc_predictions_prob_sum_chk CHECK (abs((fighter_a_win_probability + fighter_b_win_probability) - 1.0) <= 0.0001)
);
CREATE UNIQUE INDEX IF NOT EXISTS ufc_predictions_unique_idx ON ufc_predictions (fight_id, model_version, generated_at);

CREATE TABLE IF NOT EXISTS ufc_sim_runs (
  id TEXT PRIMARY KEY,
  prediction_id TEXT REFERENCES ufc_predictions(id) ON DELETE CASCADE,
  fight_id TEXT NOT NULL REFERENCES ufc_fights(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  seed INTEGER NOT NULL,
  simulation_count INTEGER NOT NULL DEFAULT 25000,
  completed_at TIMESTAMPTZ,
  cache_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ufc_sim_runs_count_chk CHECK (simulation_count >= 1)
);
CREATE INDEX IF NOT EXISTS ufc_sim_runs_fight_idx ON ufc_sim_runs (fight_id, model_version, completed_at);

CREATE TABLE IF NOT EXISTS ufc_backtest_results (
  id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  backtest_name TEXT NOT NULL,
  fold_number INTEGER NOT NULL,
  train_end_date TIMESTAMPTZ NOT NULL,
  test_start_date TIMESTAMPTZ NOT NULL,
  test_end_date TIMESTAMPTZ NOT NULL,
  fights_train_count INTEGER NOT NULL DEFAULT 0,
  fights_test_count INTEGER NOT NULL DEFAULT 0,
  log_loss DOUBLE PRECISION,
  brier_score DOUBLE PRECISION,
  calibration_error DOUBLE PRECISION,
  roi_pct DOUBLE PRECISION,
  clv_pct DOUBLE PRECISION,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ufc_backtest_walk_forward_chk CHECK (train_end_date < test_start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS ufc_backtest_results_unique_idx ON ufc_backtest_results (model_version, backtest_name, fold_number);
