# MLB run-environment follow-up pass

## Added
- probable starter handedness aware lineup split selection
- bullpen recent workload over the last 3 days
- MLB run-environment adjustment helper
- score simulation wiring for park/weather and bullpen context

## What changed
`mlb-game-context-service.ts` now includes:
- starter handedness selection
- lineup side-specific split usage
- bullpen fatigue from 3-day recent workload
- stronger park/weather run-environment logic

`mlb-game-sim-service.ts` now exposes:
- `applyMlbRunEnvironmentAdjustment(eventId, baseProjectedTotal)`

`model-engine.ts` now:
- applies MLB environment adjustment to projected total
- carries `mlbEnvironment` in metadata

## Important constraint
This is still a provider-ready scaffold, not true live Statcast/Fangraphs ingestion.
The logic path is now correct, but actual inputs still need to be fetched from real sources.
