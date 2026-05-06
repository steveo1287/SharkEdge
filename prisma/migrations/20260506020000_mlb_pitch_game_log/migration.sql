-- MLB Pitch Game Log: per-game pitcher pitch tracking from StatsAPI live feed

CREATE TABLE IF NOT EXISTS mlb_pitch_game_log (
  id TEXT PRIMARY KEY,
  game_pk INTEGER NOT NULL,
  game_date DATE NOT NULL,
  pitcher_id TEXT NOT NULL,
  pitcher_name TEXT,
  pitcher_team TEXT,
  is_starter BOOLEAN NOT NULL DEFAULT TRUE,
  innings_pitched DOUBLE PRECISION NOT NULL DEFAULT 0,
  pitch_count INTEGER NOT NULL DEFAULT 0,
  strikes INTEGER NOT NULL DEFAULT 0,
  balls INTEGER NOT NULL DEFAULT 0,
  strikeouts INTEGER NOT NULL DEFAULT 0,
  walks INTEGER NOT NULL DEFAULT 0,
  hits_allowed INTEGER NOT NULL DEFAULT 0,
  runs_allowed INTEGER NOT NULL DEFAULT 0,
  pitch_type_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  avg_velocity DOUBLE PRECISION,
  whiff_rate DOUBLE PRECISION,
  chase_rate DOUBLE PRECISION,
  k_rate DOUBLE PRECISION,
  bb_rate DOUBLE PRECISION,
  hard_hit_rate DOUBLE PRECISION,
  inning_by_inning_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'statsapi_live',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mlb_pitch_game_log_game_idx
  ON mlb_pitch_game_log (game_pk, pitcher_id);
CREATE INDEX IF NOT EXISTS mlb_pitch_game_log_date_idx
  ON mlb_pitch_game_log (game_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS mlb_pitch_game_log_game_pitcher_idx
  ON mlb_pitch_game_log (game_pk, pitcher_id);
