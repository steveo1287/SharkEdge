-- True UFC event/card records for SharkFights.
-- Kept nullable on fights so existing rows continue to work until backfilled or re-ingested.

CREATE TABLE IF NOT EXISTS ufc_events (
  id TEXT PRIMARY KEY,
  external_event_id TEXT UNIQUE,
  source_key TEXT,
  event_name TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ufc_events_date_idx ON ufc_events (event_date);
CREATE INDEX IF NOT EXISTS ufc_events_status_idx ON ufc_events (status, event_date);

ALTER TABLE ufc_fights ADD COLUMN IF NOT EXISTS event_id TEXT REFERENCES ufc_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ufc_fights_event_idx ON ufc_fights (event_id, fight_date);

-- Best-effort legacy backfill: group old fights by calendar date.
INSERT INTO ufc_events (id, external_event_id, source_key, event_name, event_date, location, status, payload_json, updated_at)
SELECT
  'ufcev_' || substr(md5('legacy:' || to_char(date_trunc('day', fight_date), 'YYYY-MM-DD')), 1, 24),
  'legacy-' || to_char(date_trunc('day', fight_date), 'YYYY-MM-DD'),
  'legacy',
  'UFC Card · ' || to_char(date_trunc('day', fight_date), 'Mon DD, YYYY'),
  min(fight_date),
  null,
  'SCHEDULED',
  jsonb_build_object('sourceKey', 'legacy', 'groupedBy', 'fight_date'),
  now()
FROM ufc_fights
WHERE event_id IS NULL
GROUP BY date_trunc('day', fight_date)
ON CONFLICT (id) DO NOTHING;

UPDATE ufc_fights f
SET event_id = e.id
FROM ufc_events e
WHERE f.event_id IS NULL
  AND e.external_event_id = 'legacy-' || to_char(date_trunc('day', f.fight_date), 'YYYY-MM-DD');
