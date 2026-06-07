# MLB elite feed contract

Input feeds should use MLBAM IDs whenever possible.

Minimum hitter feed:

```ts
MlbRawHitterStatRow[]
```

Minimum pitcher feed:

```ts
MlbRawPitcherStatRow[]
```

Preferred overlays:

```ts
MlbEliteHitterTendencyRow[]
MlbElitePitcherTendencyRow[]
MlbEliteTeamContextRow[]
MlbEliteMarketCalibrationRow[]
```

The rating service will still run with partial overlays, but reliability and data quality will drop.
