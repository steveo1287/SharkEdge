# Advanced stat feature registry pass

## Added
- `lib/types/sport-features.ts`
- `services/modeling/sport-feature-registry.ts`
- `services/modeling/advanced-stat-context-service.ts`
- advanced stat driver list UI component

## What this enables
- sport-specific advanced feature contracts
- explainable advanced-stat driver generation
- feed/model payloads can surface top sport-specific metrics
- UI can display the metrics actually moving a play

## Next follow-up
- replace seeded placeholder values with real provider-backed stat inputs
- wire sport-specific event state models to consume these features directly
- add league aliases and broader sport coverage
