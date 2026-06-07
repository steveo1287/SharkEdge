# MLB micro tendency model

## Purpose

`mlb-micro-tendency-model-v1` adds the baseball-specific randomness that the broad rating model cannot capture by itself.

It models how a matchup changes by:

- pitch type
- pitch count
- batter handedness
- pitcher handedness
- base state
- runners in scoring position
- hitter archetype
- spray direction
- batted-ball type
- park/weather/umpire context
- pitcher sequencing and pitch mix

This layer is designed to sit between `mlb-elite-rating-system-v1` and the prediction engines for NRFI, YRFI, F5, full-game totals, hitter props, pitcher strikeouts, and pitcher outs.

## New file

- `services/simulation/mlb-micro-tendency-model.ts`

Main exports:

```ts
deriveMlbMicroMatchupProjection()
deriveMlbMicroLineupAdjustment()
deriveMlbMicroGameAdjustment()
listMlbMicroRequiredVariables()
```

## What it outputs

### Per batter-vs-pitcher matchup

```ts
{
  pitchMix,
  outcome,
  spray,
  runMultiplier,
  strikeoutMultiplier,
  walkMultiplier,
  homeRunMultiplier,
  groundballMultiplier,
  reliability,
  uncertainty,
  reasons
}
```

### Per team lineup

```ts
{
  firstInningRunMultiplier,
  firstFiveRunMultiplier,
  strikeoutMultiplier,
  homeRunMultiplier,
  groundballMultiplier,
  pullAirMultiplier,
  keyMatchups,
  warnings
}
```

### Per game

```ts
{
  adjustedAwayRuns,
  adjustedHomeRuns,
  adjustedTotalRuns,
  adjustedFirstFiveTotalRuns,
  dataQuality,
  warnings
}
```

## Data variables to collect

### Pitch context

- count: `0-0`, `0-1`, `0-2`, `1-0`, `1-1`, `1-2`, `2-0`, `2-1`, `2-2`, `3-0`, `3-1`, `3-2`
- base state: `empty`, `1--`, `-2-`, `--3`, `12-`, `1-3`, `-23`, `123`
- pitch type: `FF`, `SI`, `FC`, `SL`, `ST`, `CU`, `KC`, `CH`, `FS`, `SPL`, `KN`, `OTHER`

### Hitter micro variables

- bats
- archetype: power/contact/patient/speed/balanced
- pitch-type run value
- pitch-type whiff rate
- pitch-type hard-hit rate
- swing rate by count
- contact rate by count
- chase rate by count
- outcome by count
- outcome by base state
- outcome by pitcher hand
- spray overall
- spray by pitch type
- spray by pitcher hand
- runners-on-base outcomes
- RISP outcomes
- bases-loaded outcomes
- clutch index
- stolen-base pressure

### Pitcher micro variables

- throws
- pitch mix overall
- pitch mix by count
- pitch mix by batter hand
- pitch mix by base state
- pitch run value allowed
- whiff rate by pitch
- called-strike rate by pitch
- groundball rate by pitch
- hard-hit allowed by pitch
- outcome by count
- outcome by base state
- outcome by batter hand
- hold runners score
- tempo score
- fatigue index

## How to use in the prediction model

1. Build elite team ratings.
2. Build batter and pitcher micro tendency feeds.
3. Run `deriveMlbMicroGameAdjustment()`.
4. Feed adjusted runs into the existing inning engine.
5. Use the returned multipliers to adjust player props:
   - pitcher strikeouts use `strikeoutMultiplier`
   - hitter HR/total bases use `homeRunMultiplier` and `pullAirMultiplier`
   - groundball/DP-sensitive spots use `groundballMultiplier`
   - NRFI/F5 use `firstInningRunMultiplier` and `firstFiveRunMultiplier`

Example:

```ts
const micro = deriveMlbMicroGameAdjustment({
  away,
  home,
  batterTendencies,
  pitcherTendencies,
  baseAwayRuns,
  baseHomeRuns,
  parkFactorRuns,
  parkFactorHr,
  weatherRunFactor,
  umpireZoneFactor
});

const inningProjection = projectMlbInningMarkets({
  awayTeam: micro.awayTeam,
  homeTeam: micro.homeTeam,
  awayRuns: micro.adjustedAwayRuns,
  homeRuns: micro.adjustedHomeRuns,
  awayOffenseScore,
  homeOffenseScore,
  awayStarterScore,
  homeStarterScore,
  awayBullpenScore,
  homeBullpenScore
});
```

## Gate rule

Do not make this betting-grade unless:

```ts
micro.dataQuality >= 60
micro.warnings.length === 0
away.confirmedLineup && home.confirmedLineup
```

If it fails, show a data-quality pass.
