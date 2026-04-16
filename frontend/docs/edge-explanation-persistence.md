# Edge explanation persistence pass

## What this pass does
This pass persists the structured explanation layer directly onto `EdgeSignal.metadataJson` so the same decomposition can be read by:
- the live edges feed
- future alerting logic
- future backtest/calibration jobs
- historical explanation endpoints

## Why metadataJson first
The repo already has `metadataJson` on `EdgeSignal`, which is the fastest safe way to persist explanation data without forcing a schema migration before validation.

## Persisted fields
- `adjustedEdgeScore`
- `xfactorImpactOnEdgeScore`
- `rankSignal`
- `whyItGradesWell`
- `xfactors`
- `decomposition`
- `scenarios`
- `explanationUpdatedAt`

## Next stronger database pass
After this, the strongest database follow-up is a dedicated explanation table, for example:
- `EdgeExplanationSnapshot`
- keyed by `edgeSignalId` + timestamp or model run

That would improve:
- auditability
- historical comparison
- calibration analysis over time
- model version drift analysis
