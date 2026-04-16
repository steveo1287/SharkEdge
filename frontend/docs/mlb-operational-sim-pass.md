# MLB operational sim pass

This pass incorporates your uploaded OOTP-style design guidance for:
- probability-chain at-bat resolution
- Log5 matchup blending
- league totals normalization concept
- park factors
- fatigue-aware adjustments fileciteturn4file0

## Added
- `lib/types/mlb-sim.ts`
- `services/modeling/mlb-probability-chain.ts`
- expanded MLB game context and sim service scaffolding

## What this changes
The MLB path now has:
- a chained at-bat probability model
- Log5-style event blending
- league totals config hooks
- environment-adjusted run generation
- bullpen fatigue influence
- clear contracts for plugging real lineup/starter/venue feeds into the sim
