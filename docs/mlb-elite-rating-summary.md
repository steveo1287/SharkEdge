# MLB elite rating summary

Built files:

- `services/simulation/mlb-elite-rating-system.ts`
- `tests/mlb-elite-rating-system.test.ts`
- `scripts/build-mlb-elite-rating-snapshot.ts`
- `docs/mlb-elite-rating-system.md`
- `docs/mlb-elite-rating-runbook.md`
- `docs/mlb-elite-rating-next-wire.md`

The system builds on `mlb-real-player-ratings-v1` and outputs `mlb-elite-rating-system-v1`.

Core capabilities:

- Real-stat player ratings only.
- Statcast-style hitter and pitcher overlays.
- Rolling form.
- Platoon splits.
- Player reliability and uncertainty.
- Team defense and catcher framing support.
- Bullpen fatigue and unavailable reliever penalty.
- Optional closing-market calibration.
- Team-level simulation inputs for NRFI/F5/full-game models.

Production guardrail:

Do not show high-confidence MLB picks unless the game is backed by elite ratings, confirmed/probable lineup context, matched starting pitchers, and acceptable data quality.
