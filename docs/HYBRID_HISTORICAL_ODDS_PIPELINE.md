# Hybrid Historical Odds Pipeline (SBR + Arnav + Retrosheet)

This is the practical no-API-cost path:

1. Backfill with SportsBookReview archives (2010–2021)
2. Fill recent gap with ArnavSaraogi MLB scraper output (2019–present)
3. Rebuild Retrosheet-derived MLB feature snapshots

## Source of truth rules

- Imported odds are warehouse rows in `event_markets` + `event_market_snapshots`.
- SBR source key: `sportsbookreview_historical`
- Arnav source key: `arnavsaraogi_mlb_scraper`
- Retrosheet context is used for model features and validation, not runtime downloading.

## 1) Import SBR archive files

```bash
npm run historical:import:sbr -- --path=./data/import/sbr-2010-2021.json
```

Optional league filter:

```bash
npm run historical:import:sbr -- --path=./data/import/sbr-mlb.csv --league=MLB
```

## 2) Import Arnav MLB scraper output

Use a JSON/CSV export from:
- `https://github.com/ArnavSaraogi/mlb-odds-scraper`

```bash
npm run historical:import:arnav-mlb -- --path=./data/import/arnav-mlb-2019-present.json
```

Dry run:

```bash
npm run historical:import:arnav-mlb -- --path=./data/import/arnav-mlb-2019-present.json --dry-run
```

## 3) Refresh historical intelligence overlays

```bash
npm run historical:backfill
```

## 4) Rebuild Retrosheet feature snapshots (MLB Elo / pitcher rolling)

```bash
npm run retrosheet:features
```

## Notes

- No runtime request paths download Retrosheet.
- If imported data is sparse for a given game/book/market, that market is skipped rather than fabricated.
- This pipeline preserves opening/current/closing anchors via snapshot chronology.

