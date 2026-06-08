CREATE TABLE IF NOT EXISTS ufc_deep_profile_calibration_reports (
  id TEXT PRIMARY KEY,
  fight_id TEXT NOT NULL REFERENCES ufc_fights(id) ON DELETE CASCADE,
  model_version TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actual_winner_fighter_id TEXT REFERENCES ufc_fighters(id) ON DELETE SET NULL,
  actual_method TEXT,
  actual_round INTEGER,
  calibration_error DOUBLE PRECISION NOT NULL DEFAULT 0,
  winner_error DOUBLE PRECISION NOT NULL DEFAULT 0,
  method_error DOUBLE PRECISION NOT NULL DEFAULT 0,
  round_error DOUBLE PRECISION NOT NULL DEFAULT 0,
  phase_error DOUBLE PRECISION NOT NULL DEFAULT 0,
  danger_error DOUBLE PRECISION NOT NULL DEFAULT 0,
  confidence_penalty DOUBLE PRECISION NOT NULL DEFAULT 0,
  report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  adjustment_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ufc_deep_profile_calibration_reports_unique_idx
  ON ufc_deep_profile_calibration_reports (fight_id, model_version);

CREATE INDEX IF NOT EXISTS ufc_deep_profile_calibration_reports_error_idx
  ON ufc_deep_profile_calibration_reports (model_version, calibration_error DESC, generated_at DESC);
