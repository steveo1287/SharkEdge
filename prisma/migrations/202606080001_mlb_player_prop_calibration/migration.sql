CREATE TABLE IF NOT EXISTS mlb_player_prop_calibration_rows (
  id TEXT PRIMARY KEY,
  row_key TEXT NOT NULL UNIQUE,
  source_key TEXT NOT NULL DEFAULT 'SIM_SETTLEMENT',
  event_id TEXT,
  game_id TEXT,
  player_id TEXT,
  player_name TEXT,
  team TEXT,
  opponent_team TEXT,
  market TEXT NOT NULL,
  line DOUBLE PRECISION NOT NULL,
  side TEXT NOT NULL,
  model_probability DOUBLE PRECISION NOT NULL,
  raw_model_probability DOUBLE PRECISION,
  confidence DOUBLE PRECISION,
  won BOOLEAN NOT NULL,
  actual_value DOUBLE PRECISION,
  projected_mean DOUBLE PRECISION,
  book TEXT,
  odds_american INTEGER,
  implied_probability DOUBLE PRECISION,
  hitter_archetype TEXT,
  pitcher_archetype TEXT,
  matchup_cluster_key TEXT,
  settled_at TIMESTAMPTZ,
  metadata_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mlb_prop_cal_rows_market_settled
  ON mlb_player_prop_calibration_rows (market, line, side, settled_at DESC);

CREATE INDEX IF NOT EXISTS idx_mlb_prop_cal_rows_player_market
  ON mlb_player_prop_calibration_rows (player_id, market, line, side, settled_at DESC);

CREATE INDEX IF NOT EXISTS idx_mlb_prop_cal_rows_cluster
  ON mlb_player_prop_calibration_rows (matchup_cluster_key, market, line, side, settled_at DESC);

CREATE TABLE IF NOT EXISTS mlb_player_prop_calibration_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_key TEXT NOT NULL UNIQUE,
  model_version TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  market TEXT,
  line DOUBLE PRECISION,
  side TEXT,
  probability_min DOUBLE PRECISION,
  probability_max DOUBLE PRECISION,
  sample_size INTEGER NOT NULL DEFAULT 0,
  average_predicted DOUBLE PRECISION,
  observed_rate DOUBLE PRECISION,
  probability_offset DOUBLE PRECISION,
  brier_score DOUBLE PRECISION,
  log_loss DOUBLE PRECISION,
  reliability DOUBLE PRECISION,
  roi DOUBLE PRECISION,
  hit_rate DOUBLE PRECISION,
  calibration_drift DOUBLE PRECISION,
  payload_json JSONB NOT NULL,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mlb_prop_cal_snap_scope
  ON mlb_player_prop_calibration_snapshots (scope_type, scope_key, market, line, side, refreshed_at DESC);

CREATE INDEX IF NOT EXISTS idx_mlb_prop_cal_snap_refreshed
  ON mlb_player_prop_calibration_snapshots (refreshed_at DESC);
