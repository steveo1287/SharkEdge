# MLB elite rating runbook

## Local commands

Run the focused test:

```bash
npx tsx tests/mlb-elite-rating-system.test.ts
```

Run the existing MLB production slice:

```bash
npm run test:mlb-v8-production
```

Build a snapshot from JSON feeds:

```bash
npx tsx scripts/build-mlb-elite-rating-snapshot.ts \
  --season=2026 \
  --hitters=data/mlb/hitters.json \
  --pitchers=data/mlb/pitchers.json \
  --hitterTendencies=data/mlb/hitter-tendencies.json \
  --pitcherTendencies=data/mlb/pitcher-tendencies.json \
  --teamContexts=data/mlb/team-contexts.json \
  --marketCalibration=data/mlb/market-calibration.json \
  --theShowRatings=data/mlb/the-show-live-series.json \
  --out=data/mlb/elite-ratings-2026.json
```

## Required feed shapes

### Hitter base rows

Use one row per player-season or player-current-period.

Required fields:

```ts
{
  mlbId,
  name,
  team,
  plateAppearances,
  atBats,
  hits,
  doubles,
  triples,
  homeRuns,
  walks,
  strikeouts
}
```

Preferred fields:

```ts
{
  avg,
  obp,
  slg,
  ops,
  iso,
  wrcPlus,
  xba,
  xslg,
  xwoba,
  barrelRate,
  hardHitRate,
  chaseRate,
  whiffRate,
  sprintSpeed,
  last14Ops,
  last14Woba
}
```

### Pitcher base rows

Required fields:

```ts
{
  mlbId,
  name,
  team,
  inningsPitched,
  battersFaced,
  strikeouts,
  walks,
  hitsAllowed,
  homeRunsAllowed,
  earnedRuns
}
```

Preferred fields:

```ts
{
  era,
  fip,
  xera,
  whip,
  groundballRate,
  cswRate,
  swingingStrikeRate,
  averageFastballVelocity,
  recentPitches7d
}
```

## Board gates

For high-confidence MLB display, require:

```ts
rating.metrics_json?.sourceKind === "REAL_STATS"
rating.metrics_json?.ratingSystem === "mlb-elite-rating-system-v1"
Number(rating.metrics_json?.eliteReliability) >= 0.55
Number(rating.metrics_json?.eliteUncertainty) <= 0.45
```

For game-level NRFI/F5 display, require:

```ts
gameInputs.dataQuality >= 60
away.confirmedLineup && home.confirmedLineup
away.warnings.length === 0
home.warnings.length === 0
```

If a game fails the gates, show `PASS / data quality` instead of manufacturing an edge.
