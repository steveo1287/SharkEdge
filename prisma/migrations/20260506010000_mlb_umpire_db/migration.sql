-- MLB Umpire DB: persistent umpire tendency store + daily assignment log

CREATE TABLE IF NOT EXISTS mlb_umpire_tendencies (
  id TEXT PRIMARY KEY,
  umpire_name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  k_rate_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  bb_rate_delta DOUBLE PRECISION NOT NULL DEFAULT 0,
  run_bias DOUBLE PRECISION NOT NULL DEFAULT 0,
  zone_size TEXT NOT NULL DEFAULT 'average',
  sample_games INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'seed',
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mlb_umpire_tendencies_name_key_idx
  ON mlb_umpire_tendencies (name_key);

CREATE TABLE IF NOT EXISTS mlb_umpire_assignments (
  id TEXT PRIMARY KEY,
  game_pk INTEGER NOT NULL,
  game_date DATE NOT NULL,
  hp_umpire_name TEXT,
  hp_umpire_id TEXT,
  away_team TEXT,
  home_team TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mlb_umpire_assignments_date_idx
  ON mlb_umpire_assignments (game_date);
CREATE UNIQUE INDEX IF NOT EXISTS mlb_umpire_assignments_game_pk_idx
  ON mlb_umpire_assignments (game_pk);
