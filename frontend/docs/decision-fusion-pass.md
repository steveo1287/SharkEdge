# Decision fusion pass

This pass makes the sim and trends engine obey one calibrated decision hierarchy.

## Added
- `lib/types/decision-fusion.ts`
- `services/decision/decision-fusion-service.ts`
- `services/trends/trend-regime-service.ts`
- `services/trends/trend-incremental-value-service.ts`

## What this changes
- feed ranking can use one fused score
- pass-tier plays can be suppressed from top-play surfaces
- trend regime fit and incremental value are explicitly computed
- rationale output explains whether trends are helping or just repeating the sim
