# MLB surface expansion pass

## Added
- `components/intelligence/mlb-elite-explainer.tsx`
- `app/api/v1/mlb/elite-top-plays/route.ts`
- `app/api/v1/calibration/alerts/mlb/route.ts`

## What this changes
The elite MLB layer is now available to more product surfaces:
- dedicated MLB top plays API
- MLB-specific alert stream
- reusable explanation component for detail or drawer surfaces

## Why this matters
This moves MLB elite intelligence from one board surface toward a reusable product capability.
