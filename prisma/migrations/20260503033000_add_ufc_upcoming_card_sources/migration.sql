-- Source-aware upcoming UFC card ingestion.
-- This keeps every announced matchup tied to the provider that supplied it.

ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS broadcast_info TEXT;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS early_prelims_time TIMESTAMPTZ;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS prelims_time TIMESTAMPTZ;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS main_card_time TIMESTAMPTZ;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS source_status TEXT NOT NULL DEFAULT 'OFFICIAL_PARTIAL';
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS source_urls JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ufc_events ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ufc_events_source_status_idx ON ufc_events (source_status, event_date);

ALTER TABLE ufc_fights ADD COLUMN IF NOT EXISTS bout_order INTEGER;
ALTER TABLE ufc_fights ADD COLUMN IF NOT EXISTS card_section TEXT;
ALTER TABLE ufc_fights ADD COLUMN IF NOT EXISTS source_status TEXT NOT NULL DEFAULT 'OFFICIAL_PARTIAL';
ALTER TABLE ufc_fights ADD COLUMN IF NOT EXISTS is_main_event BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ufc_fights ADD COLUMN IF NOT EXISTS is_title_fight BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ufc_fights ADD COLUMN IF NOT EXISTS is_catchweight BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ufc_fights ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS ufc_fights_card_order_idx ON ufc_fights (event_id, card_section, bout_order);
CREATE INDEX IF NOT EXISTS ufc_fights_source_status_idx ON ufc_fights (source_status, fight_date);

CREATE TABLE IF NOT EXISTS ufc_fight_sources (
  id TEXT PRIMARY KEY,
  fight_id TEXT REFERENCES ufc_fights(id) ON DELETE CASCADE,
  event_id TEXT REFERENCES ufc_events(id) ON DELETE CASCADE,
  source_name TEXT NOT NULL,
  source_url TEXT,
  source_event_id TEXT,
  source_fight_id TEXT,
  source_fighter_a TEXT,
  source_fighter_b TEXT,
  source_weight_class TEXT,
  source_bout_order INTEGER,
  source_card_section TEXT,
  source_status TEXT NOT NULL DEFAULT 'EARLY_REPORTED',
  confidence TEXT NOT NULL DEFAULT 'EARLY_REPORTED',
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ufc_fight_sources_unique_idx ON ufc_fight_sources (source_name, coalesce(source_fight_id, ''), coalesce(source_event_id, ''), coalesce(source_fighter_a, ''), coalesce(source_fighter_b, ''));
CREATE INDEX IF NOT EXISTS ufc_fight_sources_event_idx ON ufc_fight_sources (event_id, source_name, seen_at);
CREATE INDEX IF NOT EXISTS ufc_fight_sources_fight_idx ON ufc_fight_sources (fight_id, source_name, seen_at);
