# MLB promotion orchestrator pass

This is the right next move because it consolidates MLB ranking into one disciplined decision hierarchy.

## Added
- `lib/types/mlb-promotion.ts`
- `services/modeling/mlb-promotion-orchestrator.ts`
- `components/intelligence/mlb-promotion-decision-panel.tsx`

## What this changes
The MLB path now has one final promotion decision built from:
- calibrated outcome math
- decision gate
- uncertainty envelope
- certainty score
- explanation consistency
- market disagreement
- suppression logic

## Product consequence
- pass-tier MLB games can be hidden from top-play surfaces
- only strong/elite games should be alert-eligible
- final promotion is no longer a loose mix of legacy scores
