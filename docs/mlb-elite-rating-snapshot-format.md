# MLB elite snapshot format

The snapshot builder writes this top-level structure:

```ts
{
  modelVersion: "mlb-elite-rating-system-v1",
  baseModelVersion: "mlb-real-player-ratings-v1",
  season,
  generatedAt,
  hitters,
  pitchers,
  warnings,
  diagnostics,
  sourceSummary
}
```

Important diagnostic fields:

```ts
{
  hitterTendencyCoverage,
  pitcherTendencyCoverage,
  averageHitterReliability,
  averagePitcherReliability,
  averageHitterUncertainty,
  averagePitcherUncertainty,
  marketCalibrationRows,
  dataQuality
}
```

These fields should appear in the provider/readiness drawer so a user can see why a game was rated or passed.
