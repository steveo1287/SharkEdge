# Polymarket Sports Edge Notes

Restored from the surviving legacy Polymarket sports-edge skill materials after the broader assistant-tree cleanup.

## What it does

The sports-edge script compares sportsbook consensus odds against Polymarket sports market prices and looks for divergence worth investigating.

## Core idea

- Sportsbooks are usually the sharper reference market.
- Polymarket sports markets can be thinner and slower to correct.
- When the two disagree enough, the gap may be worth researching or trading.

## Useful knobs

- minimum divergence threshold
- trade size
- exit spread
- maximum resolution window for futures
- which leagues to scan
- dry run vs live mode

## SharkEdge use cases

- cross-market validation for opportunity scoring
- precompute jobs that flag large sportsbook vs Polymarket discrepancies
- debugging suspicious sportsbook moves or stale-edge candidates

## Product guardrail

Keep this logic out of hot route imports. If SharkEdge uses it later, run it in workers or offline analytics jobs and feed the results back as lean serialized snapshots.
