# Source-backed stat adapters pass

## Added
- `lib/types/advanced-stat-adapters.ts`
- `services/modeling/adapters/*`
- `services/modeling/adapters/sport-stat-adapter-router.ts`

## What this changes
The advanced stat context builder can now consume sport-specific adapter outputs instead of internal seeded defaults alone.

## Covered sports
- MLB
- NFL
- NBA
- NHL
- CBB

## Important constraint
These adapters are structured as provider-backed scaffolds. They still need actual API/provider fetch logic to become true live-source adapters.
The point of this pass is to replace one generic seed path with a typed adapter architecture that can be filled by real data providers per sport.
