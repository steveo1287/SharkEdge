# Calibration ops thresholds pass

## Added
- dedicated `CalibrationSummary` table and migration
- calibration summary persistence service
- calibration alerts writer
- pre-lock close-line capture service
- calibration ops cron route
- calibration summaries API
- per-sport degradation thresholds
- explicit 70% qualified winner target policy

## 70% target policy
The system now records `TARGET_WINNER_ACCURACY = 0.7`.

This is treated as a qualified-bucket target, not a universal forced expectation.
That matters because honest selective prediction is stronger than pretending every market should hit 70%.

## New cron path
- `/api/cron/calibration/ops`

## New API path
- `/api/v1/calibration/summaries`

## Why this is stronger
This moves SharkEdge toward a real model monitoring loop:
- capture close
- resolve outcomes
- score calibration
- persist summaries
- flag degradation
- inspect thresholds by sport and segment
