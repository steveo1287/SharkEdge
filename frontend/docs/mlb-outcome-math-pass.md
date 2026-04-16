# MLB outcome math pass

This pass moves the MLB path toward higher real-world accuracy by converting elite sim outputs into calibrated outcome probabilities instead of relying on model confidence alone.

## Added
- `lib/types/mlb-outcome-math.ts`
- `services/modeling/mlb-outcome-math-service.ts`
- `components/intelligence/mlb-outcome-math-panel.tsx`

## What this changes
- raw run/margin signals get converted into outcome probabilities
- probabilities are temperature-scaled and histogram-shrunk
- a calibration penalty and market-agreement term reduce fake certainty
- the result is a more disciplined decision score
