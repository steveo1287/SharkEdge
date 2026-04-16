# MLB elite pass

This pass upgrades the MLB path from good scaffolding into a stronger operational sim shape by adding:
- league environment normalization
- pitch-context influence
- micro-driver snapshots
- elite sim snapshot output
- explicit run-total normalization toward league targets

It also aligns with your uploaded OOTP-style requirements around:
- chained at-bat logic
- league totals and modifiers
- contextual environment effects
- fatigue-aware realism fileciteturn4file0

## Added
- `lib/types/mlb-elite.ts`
- `services/modeling/mlb-league-normalization-service.ts`
- `services/modeling/mlb-elite-sim-service.ts`

## What this changes
The MLB engine now has a clearer path to:
- probability-chain resolution
- league normalization
- park/weather influence
- bullpen fatigue effects
- explainable micro-drivers
