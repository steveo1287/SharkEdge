# MLB advanced-stat integration pass

## Added
- `lib/types/mlb-advanced.ts`
- `services/modeling/adapters/mlb-game-context-service.ts`
- upgraded `mlb-stat-adapter.ts`

## What this changes
MLB advanced-stat drivers are no longer generic seeded placeholders.
They now flow through an MLB-specific context layer that includes:
- lineup xwOBA splits
- barrel rate
- starter FIP
- bullpen quality and fatigue
- park factor
- weather-driven run environment

## Important constraint
This is an MLB-specific real-context scaffold, but it still needs true external data ingestion to become fully live.
The main gain here is that the model/feed are now driven by MLB-specific game-context logic instead of flat placeholder numbers.
