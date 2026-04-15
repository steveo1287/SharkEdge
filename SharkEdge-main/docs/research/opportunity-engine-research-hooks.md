# Opportunity Engine Research Hooks

The unified Opportunity Engine already lives in `frontend/services/opportunities/` and drives SharkEdge ranking, explanations, timing, traps, watchlist posture, and alert posture.

## Current boundary

External analytics like the restored Polymarket tools under `tools/analytics/` are **not** imported into hot Next.js routes or the opportunity service layer.

## Safe future integration pattern

If we want Polymarket divergence to influence SharkEdge later, use this path:

1. Run `tools/analytics/polymarket_sports_edge.py` or a derived worker job offline.
2. Produce a small serialized snapshot keyed by league / event / market / selection.
3. Feed that snapshot into precompute or worker-side opportunity enrichment.
4. Expose only lean derived fields to the app, such as:
   - `crossMarketDivergencePct`
   - `crossMarketValidation`
   - `crossMarketTrapFlag`
   - `crossMarketSourceNote`
5. Keep the live route graph free of Python, shell, and direct external research fetches.

## Good first use cases

- Cross-market sanity checks for sportsbook lines that look stale or isolated.
- Extra trap flags when Polymarket and sportsbook consensus strongly disagree.
- A precomputed research panel on Home or Board showing notable divergence without blocking render.

## Guardrail

Do not import tooling from `tools/` into `frontend/app/*` or hot service paths.
Everything from the restored salvage set should remain worker/precompute/research only until deliberately productized.
