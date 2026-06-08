# MLB elite intelligence upgrade

## Purpose

This layer upgrades player ratings and micro tendencies from "available" to "betting-grade inspected."

It does not simply accept a roster row or a Statcast row as elite. It scores every player by:

- rating trust
- tendency trust
- combined trust
- sample strength
- count/pitch/base-state coverage
- pitch-type skill shape
- batted-ball/spray shape
- runners-on-base context
- player-level warnings

## New files

- `services/simulation/mlb-elite-intelligence-upgrade.ts`
- `scripts/upgrade-mlb-elite-intelligence.ts`
- `tests/mlb-elite-intelligence-upgrade.test.ts`

## What gets added to each player rating

The upgrade writes these fields into `metrics_json`:

```ts
{
  eliteUpgradeModel: "mlb-elite-intelligence-upgrade-v1",
  eliteTier,
  eliteRatingTrust,
  eliteTendencyTrust,
  eliteCombinedTrust,
  eliteMicroCoverage,
  eliteSampleScore,
  eliteSkillShapeScore,
  highConfidenceEligible,
  eliteWarnings
}
```

## Player tiers

```text
ELITE
BETTABLE
WATCH
THIN
MISSING
```

High-confidence MLB picks should require players involved in the play to be `ELITE` or `BETTABLE`, not merely present in a roster table.

## Hitter tendency scoring

Hitter micro coverage uses:

- outcome by count
- outcome by base state
- pitch-type run value
- pitch-type whiff rate
- pitch-type hard-hit rate
- runners-on-base splits
- pitcher-hand splits
- spray profile

Skill shape uses:

- contact
- power
- discipline
- current form
- pitch-type run value
- pitch-type hard-hit rate
- pitch-type whiff rate
- RISP expected wOBA
- pull-air spray pressure

## Pitcher tendency scoring

Pitcher micro coverage uses:

- pitch mix overall
- pitch mix by count
- pitch mix by batter hand
- pitch mix by base state
- pitch run value allowed
- whiff by pitch
- called-strike by pitch
- groundball by pitch
- hard-hit allowed by pitch
- batter-hand outcomes
- pitch mix entropy

Skill shape uses:

- xERA quality
- FIP quality
- K-BB score
- HR-risk avoidance
- groundball score
- arsenal quality
- pitch run value allowed
- whiff pressure
- hard-hit suppression
- called-strike ability
- pitch mix diversity

## Run command

After the roster ratings and micro feeds are built:

```bash
npm run mlb:elite-upgrade -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-08
```

With explicit micro files:

```bash
npm run mlb:elite-upgrade -- \
  --season=2026 \
  --rosterType=active \
  --snapshotDate=2026-06-08 \
  --batterMicro=data/mlb/micro/batter-micro-tendencies.json \
  --pitcherMicro=data/mlb/micro/pitcher-micro-tendencies.json
```

## Outputs

```text
data/mlb/quality/elite-intelligence-quality-<date>.json
data/mlb/quality/elite-ratings-upgraded-<date>.json
```

## Gates

The report includes these gates:

- average rating trust
- hitter micro coverage
- pitcher micro coverage
- combined rating/tendency trust
- thin/missing player control

If those fail, the board should cap confidence or pass rather than treating the MLB model as elite.

## Validation

```bash
npx tsx tests/mlb-elite-intelligence-upgrade.test.ts
npm run typecheck
```
