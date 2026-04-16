# MLB elite live wiring pass

## Added
- `components/intelligence/mlb-elite-snapshot-panel.tsx`

## Updated
- `services/modeling/model-engine.ts`
- `services/feed/feed-api.ts`
- `app/page.tsx`

## What this changes
The elite MLB snapshot is no longer isolated.
It is now wired into:
- model metadata
- feed payloads
- live board-facing UI

That means the MLB elite sim can now affect:
- rank shaping
- explanation surfaces
- live product visibility

This is the pass that turns the elite MLB layer from infrastructure into an actual product feature.
