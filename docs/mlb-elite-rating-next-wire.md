# MLB elite rating wiring checklist

## What is built

- Elite player rating service.
- Elite team rating service.
- Game simulation input derivation.
- Snapshot builder scaffold.
- Focused test coverage.
- Product gate/runbook docs.

## What to wire next

1. Replace any MLB sim fallback that creates synthetic player ratings with the latest elite snapshot.
2. Add a freshness check to the board/provider diagnostics.
3. Add a hard `PASS` when elite ratings are stale, missing, or below data-quality threshold.
4. Split historical calibration into separate ledgers:
   - full-game moneyline
   - full-game total
   - F5 moneyline
   - F5 total
   - NRFI/YRFI
   - pitcher outs
   - pitcher strikeouts
   - hitter hits/total bases/home runs
5. Store each daily snapshot so every pick can be replayed against the exact ratings available at decision time.

## Why this matters

The old approach let the sim look precise while being driven by generic overall numbers. The elite layer makes each number inspectable:

- which player drove the rating
- which traits moved the rating
- how reliable the player sample is
- how much data is missing
- whether the model used real stats or fell back to weaker priors
- whether a game deserves an actual bet or a pass
