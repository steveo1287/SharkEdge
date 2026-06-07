# MLB micro tendency feed contract

## Goal

This feed turns pitch-by-pitch baseball context into model-ready variables.

The prediction model should not only know that a hitter is good or a pitcher is good. It should know the matchup shape:

- Does the pitcher throw fastballs in 2-0 counts?
- Does the hitter punish fastballs or chase sliders?
- Does the pitcher change mix with runners on?
- Does the batter pull fly balls against this pitch family?
- Does the ballpark punish or reward that spray pattern?
- Does the hitter change approach with RISP or bases loaded?

## Minimum batter micro row

```ts
{
  mlbId,
  name,
  team,
  bats,
  reliability,
  plateAppearances,
  pitchTypeRunValue,
  pitchTypeWhiffRate,
  pitchTypeHardHitRate,
  outcomeByCount,
  outcomeByBaseState,
  outcomeByPitcherHand,
  sprayOverall,
  sprayByPitchType,
  runnersOnBase
}
```

## Minimum pitcher micro row

```ts
{
  mlbId,
  name,
  team,
  throws,
  reliability,
  battersFaced,
  pitchMixOverall,
  pitchMixByCount,
  pitchMixByBatterHand,
  pitchMixByBaseState,
  pitchRunValueAllowed,
  whiffRateByPitch,
  calledStrikeRateByPitch,
  groundballRateByPitch,
  hardHitRateAllowedByPitch,
  outcomeByCount,
  outcomeByBaseState,
  outcomeByBatterHand
}
```

## Suggested source build

Build from Statcast pitch-level rows grouped by:

```ts
player_id
pitcher_id
stand
p_throws
pitch_type
balls
strikes
on_1b
on_2b
on_3b
outs_when_up
events
description
launch_speed
launch_angle
hc_x
hc_y
estimated_woba_using_speedangle
estimated_ba_using_speedangle
estimated_slg_using_speedangle
```

Then aggregate into the feed structures.

## Storage recommendation

Store daily snapshots by:

```ts
season
date
player_id
team
role
snapshot_source
```

Do not overwrite old snapshots. We need replayability for pick audits and calibration.
