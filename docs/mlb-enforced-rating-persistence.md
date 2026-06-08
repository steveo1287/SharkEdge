# MLB enforced rating persistence

## Purpose

The team-by-team no-thin rating enforcement is now able to write back into the live rating tables.

That means the enforced player grades are no longer only JSON artifacts. They can become the latest rows consumed by the live MLB v8 player-impact model.

## New file

- `services/simulation/mlb-enforced-rating-persistence.ts`

## Source key

Persisted enforced rows use:

```text
mlb-team-by-team-rating-enforcer-v1
```

Rows are written into:

```text
mlb_player_ratings
mlb_pitcher_ratings
```

Snapshot IDs are date-keyed:

```text
enforced:hitter:<snapshotDate>:<season>:<playerId>
enforced:pitcher:<snapshotDate>:<season>:<playerId>
```

## Why this matters

The live v8 player-impact model selects the latest player/pitcher rating rows by player ID ordered by `snapshot_at`.

Once enforced ratings are persisted after the base daily roster run, v8 reads the enforced rows as the newest version.

That gives the live model:

- team-by-team tiers
- experience bands
- no-thin MLB sample enforcement
- high-confidence eligibility flags
- team-by-team reasons
- upgraded overall ratings

## Run manually

Dry JSON-only output:

```bash
npm run mlb:elite-upgrade -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-08
```

Persist enforced rows:

```bash
npm run mlb:elite-upgrade -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-08 \
  --persist
```

Requires:

```text
DATABASE_URL
```

## Outputs

```text
data/mlb/quality/elite-intelligence-quality-<date>.json
data/mlb/quality/elite-ratings-upgraded-<date>.json
data/mlb/quality/team-by-team-rating-report-<date>.json
data/mlb/quality/enforced-rating-persistence-<date>.json
```

## Daily workflow

`.github/workflows/mlb-daily-roster-ratings.yml` now runs:

```bash
npm run mlb:populate-feed -- ...
npm run mlb:elite-upgrade -- ... --persist
```

The first command builds/persists base daily roster ratings and micro feed artifacts.

The second command applies the elite upgrade + team-by-team experience floor and persists the enforced rows as the live latest rating rows.

## Verify database

```sql
SELECT COUNT(*)
FROM mlb_player_ratings
WHERE source = 'mlb-team-by-team-rating-enforcer-v1';

SELECT COUNT(*)
FROM mlb_pitcher_ratings
WHERE source = 'mlb-team-by-team-rating-enforcer-v1';
```

Expected after a successful active-roster run:

- hitter rows: roughly 300+
- pitcher rows: roughly 250+

## Product rule

No player with real MLB sample should remain `THIN` or `MISSING`.

If they have MLB sample but weak micro data, the model should use:

```text
WATCH = real MLB sample, confidence capped
BETTABLE = enough MLB sample and trust
ELITE = strong rating + strong micro coverage
```
