# Simulator-First Operating Mode

SharkEdge is now running in simulator-first mode.

## Why

The TrendsCenter-style product needs deeper historical odds, weather, park, travel, and result coverage before it can honestly surface premium trend claims. Running the full trend stack without that coverage burns Railway/Vercel resources and produces noisy output.

The active product focus is:

- MLB simulation quality
- MLB model calibration and accuracy ledger
- UFC fight simulation
- Odds-aware sim snapshots

## What is paused

- Automatic GitHub Trends cache refresh schedule
- Railway trends worker deploys unless explicitly enabled
- Trends worker runtime execution unless explicitly enabled
- Historical trend refresh worker execution unless explicitly enabled
- Vercel trend-system capture, closing-line, grade, and cycle crons
- Root layout client fetches to `/api/trends/center`
- Scheduled NBA warehouse refresh while NBA is not an active lane

## What stays available

The routes are still present for manual research and future rebuild work:

- `/sharktrends`
- `/trends`
- `/sharktrends/historical-audit`
- `/sharktrends/mlb-warehouse`
- `/api/sharktrends/coverage`

The public `/trends` and `/sharktrends` pages are lightweight paused-lab pages. They do not run heavy DB trend builders on page load.

## Re-enabling heavy trend compute

Only do this when the historical warehouse is ready and we are intentionally building the premium trend product again.

Set these env/variables:

```env
SHARKTRENDS_HEAVY_ENABLED=true
ENABLE_TRENDS_WORKER_DEPLOY=true
```

Then manually run the GitHub workflow:

```bash
gh workflow run "Refresh Trends Cache" --repo steveo1287/SharkEdge -f leagues=MLB -f days=7
```

If recurring trend crons are needed again, re-add the trend-system cron entries in `vercel.json` deliberately.

## Cost guardrails

- Keep trend cache refresh manual-only by default.
- Keep NBA warehouse refresh manual-only while NBA sim is disabled.
- Keep full sim refresh at a measured cadence instead of every few minutes all day.
- Keep odds API pulls MLB-focused and within the monthly quota plan.

## Product rule

No fabricated trend records. No premium-looking trend claims until stored data coverage can back them up.