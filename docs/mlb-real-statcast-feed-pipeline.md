# MLB real Statcast feed pipeline

## Purpose

This fills the micro-tendency model with real pitch-level data instead of hand-built fixtures.

The pipeline is:

1. Export or download a Statcast CSV from Baseball Savant.
2. Normalize teams and player names.
3. Aggregate pitch-level rows into batter and pitcher micro-tendency feeds.
4. Feed those JSON files into `deriveMlbMicroGameAdjustment()`.
5. Feed adjusted runs and multipliers into NRFI, F5, full-game totals, pitcher props, and hitter props.

## New files

- `services/simulation/mlb-statcast-micro-feed-builder.ts`
- `services/simulation/mlb-statcast-row-normalizer.ts`
- `scripts/download-mlb-statcast-csv.ts`
- `scripts/build-mlb-micro-feeds-from-statcast.ts`
- `tests/mlb-statcast-micro-feed-builder.test.ts`

## Required Statcast CSV fields

The builder uses these fields when available:

```ts
pitch_type
game_date
batter
pitcher
batter_name
pitcher_name
stand
p_throws
home_team
away_team
inning_topbot
type
events
description
bb_type
balls
strikes
on_1b
on_2b
on_3b
outs_when_up
inning
zone
hc_x
hc_y
launch_speed
launch_angle
estimated_woba_using_speedangle
woba_value
estimated_slg_using_speedangle
iso_value
delta_run_exp
```

## Commands

Download a CSV from a Baseball Savant CSV export URL:

```bash
npx tsx scripts/download-mlb-statcast-csv.ts \
  --url="https://baseballsavant.mlb.com/statcast_search/csv?..." \
  --out=data/mlb/statcast.csv
```

Build micro feeds from the CSV:

```bash
npx tsx scripts/build-mlb-micro-feeds-from-statcast.ts \
  --csv=data/mlb/statcast.csv \
  --outDir=data/mlb/micro \
  --minBatterPitches=80 \
  --minPitcherPitches=80 \
  --minTerminalEvents=25
```

Outputs:

```ts
data/mlb/micro/statcast-micro-feed.json
data/mlb/micro/batter-micro-tendencies.json
data/mlb/micro/pitcher-micro-tendencies.json
```

## What gets aggregated

### Batter feed

- pitch-type run value
- whiff rate by pitch type
- hard-hit rate by pitch type
- swing/contact/chase by count
- outcome by count
- outcome by base state
- outcome by pitcher hand
- spray overall
- spray by pitch type
- spray by pitcher hand
- runners-on-base and RISP outcomes
- clutch index
- reliability

### Pitcher feed

- pitch mix overall
- pitch mix by count
- pitch mix by batter hand
- pitch mix by base state
- pitch run value allowed
- whiff by pitch
- called-strike by pitch
- groundball by pitch
- hard-hit allowed by pitch
- outcome by count
- outcome by base state
- outcome by batter hand
- reliability

## Production gate

Do not let the live board show elite confidence unless:

```ts
statcastFeed.diagnostics.usableRows / statcastFeed.diagnostics.rawRows >= 0.8
statcastFeed.diagnostics.batterCount > 0
statcastFeed.diagnostics.pitcherCount > 0
microGameAdjustment.dataQuality >= 60
microGameAdjustment.warnings.length === 0
```

## Important notes

- Use MLBAM player IDs as primary keys.
- Store daily generated feed snapshots. Do not overwrite old snapshots.
- Build separate feeds by season and rolling window.
- Recommended windows:
  - season-to-date
  - last 30 days
  - last 14 days
  - current probable starter last 5 starts
  - bullpen last 7 days
- Blend long-window reliability with short-window form inside the prediction model.
