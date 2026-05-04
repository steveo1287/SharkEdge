-- Saved systems and smart watchlist schema.
-- This stores user-saved generated/native systems and tracks alert events without creating bets.

CREATE TABLE IF NOT EXISTS saved_trend_systems (
  id TEXT PRIMARY KEY,
  system_id TEXT NOT NULL,
  system_kind TEXT NOT NULL DEFAULT 'generated',
  name TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT 'ALL',
  market TEXT NOT NULL DEFAULT 'ALL',
  side TEXT,
  saved_by TEXT NOT NULL DEFAULT 'default',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  alert_rules_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (saved_by, system_kind, system_id)
);

CREATE INDEX IF NOT EXISTS saved_trend_systems_user_status_idx
  ON saved_trend_systems (saved_by, status, created_at DESC);

CREATE INDEX IF NOT EXISTS saved_trend_systems_system_idx
  ON saved_trend_systems (system_id, system_kind);

CREATE INDEX IF NOT EXISTS saved_trend_systems_league_market_idx
  ON saved_trend_systems (league, market, status);

CREATE TABLE IF NOT EXISTS smart_watchlist_alerts (
  id TEXT PRIMARY KEY,
  saved_system_id TEXT NOT NULL REFERENCES saved_trend_systems(id) ON DELETE CASCADE,
  system_id TEXT NOT NULL,
  event_id TEXT,
  event_label TEXT,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS smart_watchlist_alerts_dedupe_idx
  ON smart_watchlist_alerts (saved_system_id, alert_type, COALESCE(event_id, 'none'));

CREATE INDEX IF NOT EXISTS smart_watchlist_alerts_status_idx
  ON smart_watchlist_alerts (status, severity, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS smart_watchlist_alerts_system_idx
  ON smart_watchlist_alerts (system_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS smart_watchlist_alert_events (
  id TEXT PRIMARY KEY,
  alert_id TEXT NOT NULL REFERENCES smart_watchlist_alerts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS smart_watchlist_alert_events_alert_idx
  ON smart_watchlist_alert_events (alert_id, created_at DESC);
