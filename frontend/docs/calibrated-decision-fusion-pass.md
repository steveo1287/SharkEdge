# Calibrated decision fusion pass

This pass calibrates the full stack together.

## Added
- `services/decision/decision-fusion-calibration-service.ts`
- `components/intelligence/decision-fusion-panel.tsx`

## What this changes
- raw fused score is no longer the final authority by itself
- calibrated fusion score becomes the final ranking signal
- elite/strong eligibility is enforced from the calibrated layer
- suppression reasons become explicit and reusable for UI, top plays, and alerts
