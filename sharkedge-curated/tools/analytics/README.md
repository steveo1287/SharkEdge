# Analytics Salvage

This directory restores a small set of useful research and utility assets that survived earlier SharkEdge cleanup.

## Restored scripts

- `polymarket_sports_edge.py`
  - Research utility for comparing sportsbook consensus prices against Polymarket sports prices.
  - Future use: worker-side divergence scans, cross-market validation, sanity checks against sportsbook lines.
- `test_odds.py`
  - Small API sanity script for fetching live sportsbook odds and checking consensus behavior.
  - Future use: provider debugging and odds-feed validation.
- `polymarket_markets.sh`
  - Public-API shell utility for screening Polymarket markets, value spots, and watchlist candidates.
  - Future use: exploratory research, market-monitoring jobs, manual validation.

## Important boundaries

- These files are research and tooling assets only.
- They are **not** imported into `frontend/app/*` or any hot route tree.
- They should stay out of the production web bundle.
- If promoted into product features later, they should run via worker/precompute jobs or explicit offline analytics flows.

## Quarantined file

- `../experimental/scrape_sportsbet_upcoming.py`
  - Preserved for reference only.
  - Not production-ready and not connected to the app runtime.

## Suggested next uses

- Compute Polymarket vs sportsbook divergence snapshots for the opportunity engine.
- Add a worker that scores cross-market disagreement without touching hot routes.
- Use `test_odds.py` as a provider sanity/debug script during feed incidents.
