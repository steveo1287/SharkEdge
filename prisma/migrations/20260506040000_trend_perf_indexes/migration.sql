-- Performance indexes for trend discovery hot paths

CREATE INDEX IF NOT EXISTS events_league_status_start_idx
  ON events (league_id, status, start_time DESC);

CREATE INDEX IF NOT EXISTS event_markets_event_market_idx
  ON event_markets (event_id, market_type);

CREATE INDEX IF NOT EXISTS discovered_trend_activations_system_active_idx
  ON discovered_trend_activations (system_id, is_active, created_at DESC);
