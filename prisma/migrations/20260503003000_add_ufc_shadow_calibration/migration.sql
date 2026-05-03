-- UFC operational proof layer: shadow predictions and calibration snapshots.

CREATE TABLE IF NOT EXISTS ufc_shadow_predictions (
  id TEXT PRIMARY KEY,
  fight_id TEXT NOT NULL REFERENCES ufc_fights(id) ON DELETE CASCADE,
  prediction_id TEXT REFERENCES ufc_predictions(id) ON DELETE SET NULL,
  model_version TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  market_odds_a_open INTEGER,
  market_odds_b_open INTEGER,
  market_odds_a_close INTEGER,
  market_odds_b_close INTEGER,
  fighter_a_win_probability DOUBLE PRECISION NOT NULL,
  fighter_b_win_probability DOUBLE PRECISION NOT NULL,
  pick_fighter_id TEXT REFERENCES ufc_fighters(id) ON DELETE SET NULL,
  actual_winner_fighter_id TEXT REFERENCES ufc_fighters(id) ON DELETE SET NULL,
  closing_line_value_pct DOUBLE PRECISION,
  result_correct BOOLEAN,
  data_quality_grade TEXT,
  confidence_grade TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ufc_shadow_prob_sum_chk CHECK (abs((fighter_a_win_probability + fighter_b_win_probability) - 1.0) <= 0.0001)
);
CREATE UNIQUE INDEX IF NOT EXISTS ufc_shadow_predictions_unique_idx ON ufc_shadow_predictions (fight_id, model_version, recorded_at);
CREATE INDEX IF NOT EXISTS ufc_shadow_predictions_model_idx ON ufc_shadow_predictions (model_version, recorded_at, status);

CREATE TABLE IF NOT EXISTS ufc_calibration_snapshots (
  id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  snapshot_label TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  fight_count INTEGER NOT NULL DEFAULT 0,
  accuracy_pct DOUBLE PRECISION,
  log_loss DOUBLE PRECISION,
  brier_score DOUBLE PRECISION,
  calibration_error DOUBLE PRECISION,
  avg_clv_pct DOUBLE PRECISION,
  bucket_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ufc_calibration_snapshots_unique_idx ON ufc_calibration_snapshots (model_version, snapshot_label, generated_at);
CREATE INDEX IF NOT EXISTS ufc_calibration_snapshots_model_idx ON ufc_calibration_snapshots (model_version, generated_at);
