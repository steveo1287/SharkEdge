# MLB model methodology notes

This file documents the MLB model ingredients wired into SharkEdge from public methodology/data sources.

## FiveThirtyEight MLB methodology inputs

FiveThirtyEight's MLB methodology describes an Elo-based baseball model built from historical game results and box scores. The model accounts for:

- Home-field advantage
- Margin of victory
- Park and era effects
- Travel
- Rest
- Starting pitchers
- Monte Carlo season simulation

The pieces currently implemented in SharkEdge are conservative helper primitives, not a full clone of FiveThirtyEight's model:

- MLB home-field Elo adjustment: `+24`
- No-fans home-field adjustment: `+9.6`
- Travel penalty: `miles_traveled ** (1 / 3) * -0.31`, capped at roughly `-4`
- Rest credit: `+2.3` Elo per rest day, capped at three days
- Pitcher game score:
  - `47.4 + strikeouts + outs * 1.5 - walks * 2 - hits * 2 - runs * 3 - homeRuns * 4`
- Starting pitcher adjustment:
  - `4.7 * (pitcherRollingGameScore - teamRollingGameScore)`
- Opener guardrail:
  - Suppress starter-specific pitcher adjustment when a starter is treated as an opener.

## Retrosheet data attribution

Retrosheet's notice allows use of its data, including commercial use, but requires this statement to appear prominently when transferring data or building a product based on the data:

> The information used here was obtained free of charge from and is copyrighted by Retrosheet. Interested parties may contact Retrosheet at www.retrosheet.org.

SharkEdge should include that attribution anywhere Retrosheet-derived data is exposed in product, docs, exports, or public model descriptions.

SharkEdge may only label an output as Retrosheet-derived when the underlying imported rows carry `sourceKey = RETROSHEET`.

## Retrosheet import process

Retrosheet data is imported as an offline warehouse. Production request paths must not download Retrosheet files.

1. Download or prepare local CSV exports named:
   - `gameinfo.csv`
   - `teamstats.csv`
   - `pitching.csv`
2. Run the local importer:
   - `npx tsx scripts/ingest-retrosheet-csv.ts --dir=path/to/csv-directory`
3. Build derived features:
   - `npx tsx scripts/build-mlb-retrosheet-features.ts`

The importer validates required columns, upserts games/team stats/pitching rows, and stores `sourceKey = RETROSHEET`. The feature builder then creates:

- rolling MLB team Elo snapshots
- rolling pitcher game-score snapshots

Pitcher game score uses the documented formula:

`47.4 + strikeouts + outs * 1.5 - walks * 2 - hits * 2 - runs * 3 - homeRuns * 4`

Team Elo uses:

`1 / (1 + 10 ^ ((RB - RA) / 400))`

with `K = 4` for regular season games and `K = 6` for postseason games.

## Current implementation status

Implemented in this PR:

- `services/analytics/team-strength/matchup-probability.ts`
  - Pythagenpat/Pythagorean expected win percentage
  - Log5 matchup probability
  - Elo expected win probability
  - Elo rating update helper
- `services/analytics/team-strength/mlb-elo-adjustments.ts`
  - MLB home/travel/rest/pitcher Elo adjustment helpers
- `services/modeling/model-engine.ts`
  - Recent scored/allowed profiles from team game stat rows
  - These feed the contextual sim's Log5 prior
- `services/data/retrosheet/*`
  - Retrosheet attribution guardrail
  - CSV parser/validator
  - local-only feature-builder helpers
- `scripts/ingest-retrosheet-csv.ts`
  - local CSV import for `gameinfo.csv`, `teamstats.csv`, and `pitching.csv`
- `scripts/build-mlb-retrosheet-features.ts`
  - rolling team Elo snapshots
  - rolling pitcher game-score snapshots
- `services/simulation/contextual-game-sim.ts`
  - Log5/Pythagenpat low-weight post-sim prior
  - Linear win expectancy fallback prior

## Current limitations

- Park and era normalization
- Full hot Monte Carlo season simulation
- Travel miles, rest, probable starters, lineups, and no-fans flags are used only when real fields already exist.
- ERA is not used as runs allowed for Retrosheet team-strength priors.
- If Retrosheet team/player IDs are missing from `externalIds`, the Retrosheet prior returns `null` and existing sim behavior continues.
- Retrosheet corrections can change historical rows. Re-import corrected CSVs and rebuild features when source data is updated.
- The Retrosheet warehouse is a model-feature source and sanity prior. It does not replace the primary Monte Carlo engine.
