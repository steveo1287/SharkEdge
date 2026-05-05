CREATE TABLE IF NOT EXISTS mlb_player_ratings (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  team TEXT NOT NULL,
  season INTEGER NOT NULL,
  primary_position TEXT,
  role_tier TEXT NOT NULL DEFAULT 'UNKNOWN',
  contact DOUBLE PRECISION,
  power DOUBLE PRECISION,
  discipline DOUBLE PRECISION,
  vs_lhp DOUBLE PRECISION,
  vs_rhp DOUBLE PRECISION,
  baserunning DOUBLE PRECISION,
  fielding DOUBLE PRECISION,
  current_form DOUBLE PRECISION,
  overall DOUBLE PRECISION,
  metrics_json JSONB,
  source TEXT NOT NULL DEFAULT 'manual',
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mlb_pitcher_ratings (
  id TEXT PRIMARY KEY,
  pitcher_id TEXT NOT NULL,
  pitcher_name TEXT NOT NULL,
  team TEXT NOT NULL,
  season INTEGER NOT NULL,
  role_tier TEXT NOT NULL DEFAULT 'UNKNOWN',
  xera_quality DOUBLE PRECISION,
  fip_quality DOUBLE PRECISION,
  k_bb DOUBLE PRECISION,
  hr_risk DOUBLE PRECISION,
  groundball_rate DOUBLE PRECISION,
  platoon_split DOUBLE PRECISION,
  stamina DOUBLE PRECISION,
  recent_workload DOUBLE PRECISION,
  arsenal_quality DOUBLE PRECISION,
  overall DOUBLE PRECISION,
  metrics_json JSONB,
  source TEXT NOT NULL DEFAULT 'manual',
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mlb_lineup_snapshots (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL,
  team TEXT NOT NULL,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  batting_order_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  bench_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  starting_pitcher_id TEXT,
  starting_pitcher_name TEXT,
  available_relievers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  unavailable_relievers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  injuries_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual',
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mlb_player_ratings_team_season_idx ON mlb_player_ratings (team, season, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS mlb_pitcher_ratings_team_season_idx ON mlb_pitcher_ratings (team, season, snapshot_at DESC);
CREATE INDEX IF NOT EXISTS mlb_lineup_snapshots_game_idx ON mlb_lineup_snapshots (game_id, team, captured_at DESC);
