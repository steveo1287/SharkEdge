-- Stores generated trend runner executions so nightly/manual runs can be audited.
-- The runner remains dry-run by default; this table records both dry-run and write runs.

CREATE TABLE IF NOT EXISTS generated_trend_run_logs (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'manual',
  dry_run BOOLEAN NOT NULL DEFAULT true,
  league TEXT NOT NULL DEFAULT 'ALL',
  market TEXT NOT NULL DEFAULT 'ALL',
  depth TEXT NOT NULL DEFAULT 'core',
  limit_count INTEGER NOT NULL DEFAULT 250,
  min_sample INTEGER NOT NULL DEFAULT 50,
  min_roi_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  history_limit INTEGER NOT NULL DEFAULT 100,
  start_date TEXT,
  end_date TEXT,
  source_connected BOOLEAN NOT NULL DEFAULT false,
  rows_loaded INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  total_candidates INTEGER NOT NULL DEFAULT 0,
  returned_candidates INTEGER NOT NULL DEFAULT 0,
  ready_count INTEGER NOT NULL DEFAULT 0,
  insufficient_sample_count INTEGER NOT NULL DEFAULT 0,
  no_rows_count INTEGER NOT NULL DEFAULT 0,
  no_matches_count INTEGER NOT NULL DEFAULT 0,
  persisted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  source_note TEXT,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_trend_run_logs_created_idx
  ON generated_trend_run_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS generated_trend_run_logs_mode_status_idx
  ON generated_trend_run_logs (mode, status, created_at DESC);

CREATE INDEX IF NOT EXISTS generated_trend_run_logs_league_market_idx
  ON generated_trend_run_logs (league, market, created_at DESC);
