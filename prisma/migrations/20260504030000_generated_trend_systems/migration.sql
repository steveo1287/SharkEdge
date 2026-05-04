-- Generated trend systems are persisted only after candidate backtests clear minimum quality gates.
-- This migration intentionally keeps the tables independent from the existing saved-trend tables
-- so generated systems can be promoted gradually without disrupting current SharkTrends flows.

CREATE TABLE IF NOT EXISTS generated_trend_systems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  league TEXT NOT NULL,
  market TEXT NOT NULL,
  side TEXT NOT NULL,
  filter_json JSONB NOT NULL,
  conditions_json JSONB NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  related_key TEXT NOT NULL,
  description TEXT NOT NULL,
  generated_by TEXT NOT NULL DEFAULT 'trend_factory_v1',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  quality_gate TEXT NOT NULL,
  gate_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  preview_tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_backtested_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_trend_systems_league_market_idx
  ON generated_trend_systems (league, market, side);

CREATE INDEX IF NOT EXISTS generated_trend_systems_related_key_idx
  ON generated_trend_systems (related_key);

CREATE INDEX IF NOT EXISTS generated_trend_systems_quality_gate_idx
  ON generated_trend_systems (quality_gate, status);

CREATE TABLE IF NOT EXISTS generated_trend_system_snapshots (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL REFERENCES generated_trend_systems(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sample_size INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  pushes INTEGER NOT NULL DEFAULT 0,
  voids INTEGER NOT NULL DEFAULT 0,
  pending INTEGER NOT NULL DEFAULT 0,
  profit_units DOUBLE PRECISION NOT NULL DEFAULT 0,
  roi_pct DOUBLE PRECISION,
  win_rate_pct DOUBLE PRECISION,
  clv_pct DOUBLE PRECISION,
  average_price INTEGER,
  last10 TEXT,
  last30 TEXT,
  current_streak TEXT,
  strength_score INTEGER,
  grade TEXT NOT NULL DEFAULT 'P',
  quality_gate TEXT NOT NULL,
  gate_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_trend_system_snapshots_system_generated_idx
  ON generated_trend_system_snapshots (system_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS generated_trend_system_snapshots_grade_idx
  ON generated_trend_system_snapshots (grade, quality_gate, generated_at DESC);

CREATE TABLE IF NOT EXISTS generated_trend_system_results (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL REFERENCES generated_trend_systems(id) ON DELETE CASCADE,
  snapshot_id TEXT REFERENCES generated_trend_system_snapshots(id) ON DELETE CASCADE,
  event_id TEXT,
  source_event_id TEXT,
  game_date TIMESTAMPTZ NOT NULL,
  matchup TEXT NOT NULL,
  side TEXT NOT NULL,
  price INTEGER,
  closing_price INTEGER,
  result TEXT NOT NULL,
  units DOUBLE PRECISION NOT NULL DEFAULT 0,
  clv_pct DOUBLE PRECISION,
  matched_filters_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  qualifying_reason TEXT NOT NULL,
  filter_match_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS generated_trend_system_results_system_source_idx
  ON generated_trend_system_results (system_id, source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS generated_trend_system_results_system_date_idx
  ON generated_trend_system_results (system_id, game_date DESC);

CREATE INDEX IF NOT EXISTS generated_trend_system_results_result_idx
  ON generated_trend_system_results (result, game_date DESC);
