-- MLB Feature Monitor: staleness + drift snapshots and retrain log

CREATE TABLE IF NOT EXISTS mlb_feature_monitor_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  feature_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'UNKNOWN',
  last_updated_at TIMESTAMPTZ,
  staleness_hours DOUBLE PRECISION,
  sample_count INTEGER NOT NULL DEFAULT 0,
  drift_score DOUBLE PRECISION,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mlb_feature_monitor_key_time_idx
  ON mlb_feature_monitor_snapshots (feature_key, snapshot_at DESC);

CREATE TABLE IF NOT EXISTS mlb_retrain_log (
  id TEXT PRIMARY KEY,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_reason TEXT NOT NULL,
  training_rows INTEGER NOT NULL DEFAULT 0,
  side_accuracy DOUBLE PRECISION,
  total_accuracy DOUBLE PRECISION,
  prev_side_accuracy DOUBLE PRECISION,
  improvement DOUBLE PRECISION,
  model_activated BOOLEAN NOT NULL DEFAULT FALSE,
  model_key TEXT,
  warning TEXT,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mlb_retrain_log_triggered_idx
  ON mlb_retrain_log (triggered_at DESC);
