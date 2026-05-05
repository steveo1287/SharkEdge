CREATE TABLE IF NOT EXISTS mlb_premium_formula_profiles (
  id TEXT PRIMARY KEY,
  model_version TEXT NOT NULL DEFAULT 'mlb-premium-formula-stack-v1',
  status TEXT NOT NULL,
  sample_size INTEGER NOT NULL DEFAULT 0,
  weights_json JSONB NOT NULL,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mlb_premium_formula_profiles_active_idx
  ON mlb_premium_formula_profiles (model_version, is_active, trained_at DESC);
