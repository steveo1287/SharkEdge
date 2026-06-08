# MLB intelligence readiness

## Purpose

This layer tells operators whether the MLB model is actually fed for production.

It checks:

- latest populate/feed report
- all-team roster rating coverage
- database persistence status
- daily rating row counts
- Statcast micro feed files
- Statcast micro feed diagnostics
- synthetic fallback block status

## New files

- `services/simulation/mlb-intelligence-readiness.ts`
- `app/api/mlb/intelligence-readiness/route.ts`
- `app/mlb/intelligence/page.tsx`
- `tests/mlb-intelligence-readiness.test.ts`

## API

```text
GET /api/mlb/intelligence-readiness
```

Response shape:

```ts
{
  ok: boolean,
  ready: boolean,
  report: {
    state,
    rosterRatings,
    microTendencies,
    syntheticFallback,
    gates,
    warnings
  }
}
```

## UI

```text
/mlb/intelligence
```

Shows:

- overall state
- roster rating state
- teams covered
- players seen
- hitters rated
- pitchers rated
- database hitter/pitcher rows
- micro feed counts
- usable pitch rows
- production gates
- warnings

## Gate definitions

### Roster ratings

Ready only when:

```ts
teamsCovered === 30
playersSeen >= 650
hittersRated >= 300
pitchersRated >= 250
persisted === true
database hitter rows > 0
database pitcher rows > 0
```

### Micro tendencies

Ready only when:

```ts
batterCount > 0
pitcherCount > 0
usableRows > 0
terminalPitchRows > 0
battedBallRows > 0
batter feed file exists
pitcher feed file exists
```

### Synthetic fallback

Always blocked for high-confidence MLB.

A game can still be shown as informational, but high-confidence picks should require readiness gates to pass.

## Local validation

```bash
npx tsx tests/mlb-intelligence-readiness.test.ts
npm run typecheck
```

## Operational use

After running:

```bash
npm run mlb:populate-feed -- --season=2026 --rosterType=active --snapshotDate=$(date -u +%F)
```

check:

```text
/mlb/intelligence
```

or:

```bash
curl /api/mlb/intelligence-readiness
```
