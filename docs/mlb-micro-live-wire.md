# MLB micro tendency live wire

## What changed

The generated Statcast micro feeds are now wired into the live MLB v8 player-impact projection path.

Flow:

```text
base projection
  -> v8 roster/player impact run adjustment
  -> Statcast micro tendency run adjustment
  -> player stat projections
  -> inning market projections
  -> NRFI/F5/full-game outputs
```

## New integration file

`services/simulation/mlb-v8-micro-tendency-integration.ts`

Responsibilities:

- Read generated JSON feed files.
- Cache feed contents per process.
- Use default file paths:
  - `data/mlb/micro/batter-micro-tendencies.json`
  - `data/mlb/micro/pitcher-micro-tendencies.json`
- Support override env vars:
  - `MLB_BATTER_MICRO_TENDENCIES_PATH`
  - `MLB_PITCHER_MICRO_TENDENCIES_PATH`
- Convert the v8 team context into the micro model shape.
- Apply `deriveMlbMicroGameAdjustment()`.
- Return adjusted runs only when the micro data-quality gate passes.

## Updated live model

`services/simulation/mlb-v8-player-impact-model.ts`

The model now:

1. Calculates skill-adjusted runs from player ratings.
2. Calls `applyMlbV8MicroTendencyAdjustment()`.
3. Uses micro-adjusted runs for:
   - win probability blend
   - player stat projections
   - inning market projections
   - F5/NRFI review
4. Stores the micro result in `mlbIntel.playerImpact.microTendencyAdjustment`.

## Gate behavior

If feeds are missing or bad:

- V8 player impact still runs.
- Micro adjustment is not applied.
- Confidence is capped lower.
- Reasons explain why the micro layer skipped.

If feeds pass:

- Adjusted runs include pitch-count, pitch-type, hand, base-state, spray, and runners-on-base effects.
- Player props and inning markets receive the adjusted run environment.

## Required run order

```bash
npx tsx scripts/build-mlb-micro-feeds-from-statcast.ts \
  --csv=data/mlb/statcast.csv \
  --outDir=data/mlb/micro

npx tsx tests/mlb-statcast-micro-feed-builder.test.ts
npx tsx tests/mlb-micro-tendency-model.test.ts
npx tsx tests/mlb-v8-player-impact-model.test.ts
npm run typecheck
```
