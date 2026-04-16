# MLB live feed integration pass

## Added
- `services/modeling/adapters/mlb-live-provider.ts`

## Updated
- `lib/types/mlb-advanced.ts`
- `services/modeling/adapters/mlb-game-context-service.ts`

## What this changes
The MLB context service is now built around a live-provider-ready input layer for:
- probable starter handedness
- lineup side-specific splits
- bullpen recent 3-day pitch workload
- venue-aware park and weather context

## Important constraint
This is still a provider-ready integration shell, not actual external API fetching.
But it now has the correct contract boundaries to plug in:
- projected lineups
- probable starters
- bullpen logs
- venue and forecast feeds
without rewriting the sim path again.
