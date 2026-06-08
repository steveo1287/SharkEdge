# MLB team-by-team rating enforcer

## Purpose

This layer prevents SharkEdge from giving lazy `THIN` or `MISSING` grades to players who already have real MLB plate appearances, at-bats, innings, or batters faced.

A missing Statcast micro row can still reduce confidence, but it can no longer erase a real MLB sample.

## New files

- `services/simulation/mlb-team-by-team-rating-enforcer.ts`
- `tests/mlb-team-by-team-rating-enforcer.test.ts`

The enforcer is now wired into:

- `scripts/upgrade-mlb-elite-intelligence.ts`

## Rule

If a player has real MLB sample, they receive at least a modeled `WATCH` grade.

Established players can be floored to `BETTABLE` when rating trust and skill-shape score support it.

## Experience bands

### Hitters

```text
ESTABLISHED: 300+ PA/AB sample
REGULAR: 75-299 PA/AB sample
MLB_SAMPLE: 1-74 PA/AB sample
NO_MLB_SAMPLE: 0
```

### Pitchers

```text
ESTABLISHED: 450+ BF-equivalent
REGULAR: 120-449 BF-equivalent
MLB_SAMPLE: 1-119 BF-equivalent
NO_MLB_SAMPLE: 0
```

Pitcher BF-equivalent uses:

```text
max(battersFaced, BF, inningsPitched * 4.25)
```

## Tier floor

```text
NO_MLB_SAMPLE -> no forced floor
MLB_SAMPLE -> WATCH minimum
REGULAR -> WATCH minimum, BETTABLE when trust is strong
ESTABLISHED -> WATCH minimum, BETTABLE when trust/skill shape are strong
```

## Metrics added to each player

The enforcer writes these fields into `metrics_json`:

```ts
{
  teamByTeamRatingModel: "mlb-team-by-team-rating-enforcer-v1",
  experienceBand,
  majorLeagueSample,
  experienceFloorApplied,
  noThinMlbSampleEnforced,
  highConfidenceEligible,
  teamByTeamReasons
}
```

## Script output

The elite upgrade command now writes:

```text
data/mlb/quality/elite-intelligence-quality-<date>.json
data/mlb/quality/elite-ratings-upgraded-<date>.json
data/mlb/quality/team-by-team-rating-report-<date>.json
```

## Run

```bash
npm run mlb:elite-upgrade -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-08
```

## Validation

```bash
npx tsx tests/mlb-team-by-team-rating-enforcer.test.ts
npx tsx tests/mlb-elite-intelligence-upgrade.test.ts
npm run typecheck
```

## Board behavior

The board should not show a player as `THIN` or `MISSING` when:

```text
majorLeagueSample > 0
```

Instead:

- `WATCH` means there is real MLB sample, but confidence is capped.
- `BETTABLE` means there is enough MLB sample and rating trust for model use.
- `ELITE` means both rating and micro-tendency coverage are strong.
