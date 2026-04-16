# MLB primary decision pass

This pass makes calibrated outcome math the primary MLB promotion signal instead of a side payload.

## Added
- `services/modeling/mlb-decision-score-service.ts`
- `components/intelligence/mlb-primary-decision-panel.tsx`

## What this changes
- MLB promotion tier now depends on calibrated outcome math plus decision gate
- primary decision score becomes the real MLB surfacing signal
- weaker games get pushed to watchlist/pass instead of being cosmetically dressed up
