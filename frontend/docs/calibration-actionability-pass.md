# Calibration actionability pass

## Added
- active alert routing API
- alert dedupe and suppression helper
- winner-only qualification logic
- degraded factor bucket down-weighting helper

## New API
- `/api/v1/calibration/alerts`

## What this enables
- UI can render active calibration alerts
- repeated alerts can be suppressed by signature + cooldown
- non-winner markets do not get treated as qualified winner picks
- degraded factor buckets can be automatically penalized in live ranking

## 70% target handling
The 70% target should only be used for selective, qualified winner buckets.
It should not be forced onto every market or every displayed pick.
