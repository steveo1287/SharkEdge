# MLB populate and feed

## Purpose

`mlb:populate-feed` is the one-command production path for getting MLB intelligence into SharkEdge.

It does two things:

1. Populates daily roster/player-rating snapshots for all 30 MLB teams.
2. Refreshes the live micro-tendency feed files when a Statcast CSV source is available.

## Command

```bash
npm run mlb:populate-feed -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-07
```

## With Statcast micro feed

Using a local CSV:

```bash
npm run mlb:populate-feed -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-07 \
  --statcastCsv=data/mlb/statcast.csv
```

Using a Baseball Savant CSV export URL:

```bash
npm run mlb:populate-feed -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-07 \
  --statcastUrl="https://baseballsavant.mlb.com/statcast_search/csv?..."
```

Or use env vars:

```bash
DATABASE_URL=postgres://... \
MLB_STATCAST_CSV_URL="https://baseballsavant.mlb.com/statcast_search/csv?..." \
npm run mlb:populate-feed -- --season=2026 --rosterType=active
```

## What it writes

### Database

Requires:

```text
DATABASE_URL
```

Writes daily date-keyed snapshots into:

```text
mlb_player_ratings
mlb_pitcher_ratings
```

These are the same tables used by the live MLB v8 player-impact model.

### Files

Always writes a report:

```text
data/mlb/populate-feed-report-<date>.json
```

When Statcast CSV is provided, writes:

```text
data/mlb/micro/statcast-micro-feed-<date>.json
data/mlb/micro/statcast-micro-feed.json
data/mlb/micro/batter-micro-tendencies.json
data/mlb/micro/pitcher-micro-tendencies.json
```

The live micro model reads:

```text
data/mlb/micro/batter-micro-tendencies.json
data/mlb/micro/pitcher-micro-tendencies.json
```

unless overridden by:

```text
MLB_BATTER_MICRO_TENDENCIES_PATH
MLB_PITCHER_MICRO_TENDENCIES_PATH
```

## GitHub Actions

Workflow:

```text
.github/workflows/mlb-daily-roster-ratings.yml
```

Required secret:

```text
DATABASE_URL
```

Optional secret:

```text
MLB_STATCAST_CSV_URL
```

Without `MLB_STATCAST_CSV_URL`, the workflow still populates roster/player ratings, but skips micro feed refresh.

## Validation commands

```bash
npx tsx tests/mlb-daily-roster-rating-snapshot.test.ts
npx tsx tests/mlb-statcast-micro-feed-builder.test.ts
npx tsx tests/mlb-micro-tendency-model.test.ts
npx tsx tests/mlb-v8-player-impact-model.test.ts
npm run typecheck
```

## Production gate

The live board should treat MLB as fully fed only when:

- daily roster snapshot report has `ok: true`
- `teamsCovered` is `30`
- `hittersRated` and `pitchersRated` are above thresholds
- database persistence is true
- micro feed exists and has nonzero batter/pitcher counts
- v8 player-impact has `microTendencyAdjustment.applied === true`
