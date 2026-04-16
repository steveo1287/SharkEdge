# MLB decision gating pass

This pass upgrades MLB intelligence from richer estimates into stricter decision discipline.

## Added
- `services/modeling/mlb-conformal-gating-service.ts`
- `components/intelligence/mlb-decision-gate-panel.tsx`

## What this changes
MLB predictions are now gated by:
- uncertainty band width
- explanation stability
- selective qualification
- uncertainty penalty

## Why this matters
The strongest predictive systems do not only estimate better.
They also refuse weak opportunities and promote only the most stable ones.
