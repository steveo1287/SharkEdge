# Salvage Restore Note

This restore pass did **not** find the requested `sharkedge_salvage/` bundle in the workspace.

Instead, the following files were selectively recovered from surviving legacy skill directories and re-homed into clean repo locations:

- `skills/polymarket-sports-edge/sports_edge.py` -> `tools/analytics/polymarket_sports_edge.py`
- `skills/polymarket-sports-edge/test_odds.py` -> `tools/analytics/test_odds.py`
- `skills/polymarket-screener/scripts/polymarket.sh` -> `tools/analytics/polymarket_markets.sh`
- `skills/sportsbet-advisor/scripts/scrape_sportsbet_upcoming.py` -> `tools/experimental/scrape_sportsbet_upcoming.py`

The markdown notes under `docs/research/` were reconstructed from surviving Polymarket skill docs and tips so the useful research context remains available without reviving the old assistant scaffolding.
