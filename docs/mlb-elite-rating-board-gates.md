# MLB elite rating board gates

High-confidence MLB picks should require these checks:

```ts
const eliteReady =
  gameInputs.dataQuality >= 60 &&
  away.confirmedLineup &&
  home.confirmedLineup &&
  away.warnings.length === 0 &&
  home.warnings.length === 0;
```

Core player checks:

```ts
const playerReady =
  rating.metrics_json?.sourceKind === "REAL_STATS" &&
  rating.metrics_json?.ratingSystem === "mlb-elite-rating-system-v1" &&
  Number(rating.metrics_json?.eliteReliability) >= 0.55 &&
  Number(rating.metrics_json?.eliteUncertainty) <= 0.45;
```

If these fail, the board should show a data-quality pass rather than a false edge.
