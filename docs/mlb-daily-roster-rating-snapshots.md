# MLB daily roster rating snapshots

## Purpose

This job builds daily roster and player-rating snapshots for all 30 MLB teams.

It fills the same tables used by the live MLB v8 model:

- `mlb_player_ratings`
- `mlb_pitcher_ratings`

The live model already reads latest rows from those tables when building roster/player impact.

## New files

- `services/simulation/mlb-daily-roster-rating-snapshot.ts`
- `scripts/build-daily-mlb-roster-rating-snapshots.ts`
- `tests/mlb-daily-roster-rating-snapshot.test.ts`
- `.github/workflows/mlb-daily-roster-ratings.yml`

## Data source

The daily builder uses MLB Stats API style endpoints:

```text
/api/v1/teams?sportId=1&activeStatus=Y&season=<season>
/api/v1/teams/<teamId>/roster?rosterType=active&season=<season>&hydrate=person
/api/v1/people/<personId>/stats?stats=season&group=hitting&season=<season>
/api/v1/people/<personId>/stats?stats=season&group=pitching&season=<season>
```

`MLB_STATS_API_BASE_URL` defaults to:

```text
https://statsapi.mlb.com
```

## What gets built

For every team:

- active roster players
- hitter rows for non-pitchers
- pitcher rows for pitchers
- position, handedness, roster status, jersey number
- season-to-date stat-driven ratings when stats are available
- baseline low-sample ratings when a player has no MLB stat line yet
- daily snapshot IDs keyed by date so historical snapshots are preserved

Snapshot IDs look like:

```text
daily:hitter:2026-06-07:2026:<playerId>
daily:pitcher:2026-06-07:2026:<playerId>
```

## Run manually

Persist to database:

```bash
npm run mlb:daily-roster-ratings -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-07
```

Dry run report only:

```bash
npm run mlb:daily-roster-ratings -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-07 \
  --dryRun
```

Roster-only baseline build:

```bash
npm run mlb:daily-roster-ratings -- \
  --season=2026 \
  --rosterOnly
```

## Scheduled workflow

GitHub Actions workflow:

```text
.github/workflows/mlb-daily-roster-ratings.yml
```

Schedule:

```text
13:15 UTC daily
```

Required secret:

```text
DATABASE_URL
```

## Coverage gate

The report passes only when:

- 30 teams are found
- every team has at least 20 active-roster players
- every team has enough hitter ratings
- every team has enough pitcher ratings

The report writes to:

```text
data/mlb/daily-roster-rating-snapshot-<date>.json
```

## Live model impact

After this job runs, the live v8 player-impact model can pull latest daily ratings through its existing database queries. Those ratings then flow into:

- adjusted run environment
- micro tendency adjustment
- player props
- F5 projections
- NRFI/YRFI projections
