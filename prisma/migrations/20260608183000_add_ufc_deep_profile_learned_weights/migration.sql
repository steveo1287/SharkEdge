CREATE TABLE IF NOT EXISTS ufc_deep_profile_learned_weights (
  id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  report_count INTEGER NOT NULL DEFAULT 0,
  avg_calibration_error DOUBLE PRECISION NOT NULL DEFAULT 0,
  high_miss_count INTEGER NOT NULL DEFAULT 0,
  weights_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ufc_deep_profile_learned_weights_unique_idx
  ON ufc_deep_profile_learned_weights (model_version);

CREATE INDEX IF NOT EXISTS ufc_deep_profile_learned_weights_generated_idx
  ON ufc_deep_profile_learned_weights (generated_at DESC);
