-- Market data ingestion schema for sourced market intelligence.
-- These tables are source-agnostic: they can ingest odds snapshots, betting splits,
-- and line-history data from any approved provider without fabricating market signals.

CREATE TABLE IF NOT EXISTS market_books (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_book_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, source_book_id)
);

CREATE INDEX IF NOT EXISTS market_books_source_active_idx
  ON market_books (source, is_active);

CREATE TABLE IF NOT EXISTS market_odds_snapshots (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  league TEXT NOT NULL,
  sport TEXT,
  market_type TEXT NOT NULL,
  side TEXT NOT NULL,
  selection TEXT,
  sportsbook_id TEXT REFERENCES market_books(id) ON DELETE SET NULL,
  sportsbook_name TEXT,
  price INTEGER,
  point DOUBLE PRECISION,
  open_price INTEGER,
  open_point DOUBLE PRECISION,
  current_price INTEGER,
  current_point DOUBLE PRECISION,
  closing_price INTEGER,
  closing_point DOUBLE PRECISION,
  implied_probability DOUBLE PRECISION,
  source TEXT NOT NULL DEFAULT 'manual',
  source_snapshot_id TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS market_odds_snapshots_source_unique_idx
  ON market_odds_snapshots (source, source_snapshot_id)
  WHERE source_snapshot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_odds_snapshots_event_idx
  ON market_odds_snapshots (event_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS market_odds_snapshots_league_market_idx
  ON market_odds_snapshots (league, market_type, side, captured_at DESC);

CREATE INDEX IF NOT EXISTS market_odds_snapshots_book_idx
  ON market_odds_snapshots (sportsbook_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS market_betting_splits (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  league TEXT NOT NULL,
  sport TEXT,
  market_type TEXT NOT NULL,
  side TEXT NOT NULL,
  selection TEXT,
  bet_pct DOUBLE PRECISION,
  money_pct DOUBLE PRECISION,
  diff_pct DOUBLE PRECISION,
  ticket_count INTEGER,
  handle_count INTEGER,
  source TEXT NOT NULL DEFAULT 'manual',
  source_split_id TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS market_betting_splits_source_unique_idx
  ON market_betting_splits (source, source_split_id)
  WHERE source_split_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_betting_splits_event_idx
  ON market_betting_splits (event_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS market_betting_splits_league_market_idx
  ON market_betting_splits (league, market_type, side, captured_at DESC);

CREATE TABLE IF NOT EXISTS market_line_history (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  league TEXT NOT NULL,
  sport TEXT,
  market_type TEXT NOT NULL,
  side TEXT NOT NULL,
  selection TEXT,
  sportsbook_id TEXT REFERENCES market_books(id) ON DELETE SET NULL,
  sportsbook_name TEXT,
  price INTEGER,
  point DOUBLE PRECISION,
  movement_from_price INTEGER,
  movement_from_point DOUBLE PRECISION,
  movement_direction TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_line_id TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS market_line_history_source_unique_idx
  ON market_line_history (source, source_line_id)
  WHERE source_line_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS market_line_history_event_idx
  ON market_line_history (event_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS market_line_history_league_market_idx
  ON market_line_history (league, market_type, side, captured_at DESC);

CREATE INDEX IF NOT EXISTS market_line_history_book_idx
  ON market_line_history (sportsbook_id, captured_at DESC);
