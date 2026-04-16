# MLB board integration pass

## Added
- `components/board/mlb-elite-card-strip.tsx`
- `components/board/live-edge-board-card-shell.tsx`

## What this changes
The MLB elite snapshot is now board-card native rather than a side panel only.
Each surfaced MLB play can now show:
- normalized total
- park/weather delta
- top micro-drivers

## Product effect
This makes elite MLB intelligence part of the actual decision surface.
