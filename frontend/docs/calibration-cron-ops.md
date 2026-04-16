# Calibration cron ops pass

## What this pass adds
- scheduled calibration route: `/api/cron/calibration`
- latest daily summary route: `/api/v1/calibration/daily`
- daily summary writer service
- degradation flagging for:
  - factor buckets
  - model versions
  - confidence buckets
- Vercel cron config in `vercel.ts`

## Cadence
- hourly snapshot / resolution sweep
- daily summary run

## Auth
If `CRON_SECRET` is present, the cron route expects:
`Authorization: Bearer <CRON_SECRET>`

## Where summaries are stored
Daily summaries are currently persisted via `ImportBatch.metadataJson` using:
- `source = calibration_daily_summary`
- `status = COMPLETED`

This avoids forcing another schema migration before validating the pipeline.

## Next strongest follow-up
- dedicated calibration summary table
- alert notifications when flags cross thresholds
- per-sport threshold tuning
- scheduled close-line capture before event lock
