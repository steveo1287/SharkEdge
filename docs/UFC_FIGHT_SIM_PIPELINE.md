# UFC Fight Sim Pipeline

This pipeline powers `services/modeling/ufc-fight-sim-service.ts` and is used automatically when `event.league.key === "UFC"`.

## Core Data Path

1. UFC events and competitors are synced into:
- `event`
- `event_participants` (`COMPETITOR_A`, `COMPETITOR_B`)
- `event_participant_context`

2. Fighter historical metrics are read from:
- `player_game_stats.statsJson`

3. Optional market anchor (light prior) is read from:
- `current_market_state` (`fight_winner` or `moneyline`)

## Optional Enrichment Sources

The sim supports external enrichment for amateur/camp context.

- `UFC_AMATEUR_PROFILE_URL`
- `UFC_FIGHT_CAMP_PROFILE_URL`

Recommended payload additions for best results:

- `campTier`
- `trainingPartnerTier`
- `amateurRank`
- `styleTag` (optional)
- `sparringPartnerEloAvg` (optional)

Expected response shape (minimum):

```json
{
  "amateurRank": 71,
  "campTier": 68,
  "trainingPartnerTier": 74
}
```

Each endpoint is queried with:

`?fighter=<fighter_name>`

## Fighter Keys In `player_game_stats.statsJson`

The sim reads these aliases when available:

- Striking:
`sig_strikes_landed_per_min`, `slpm`, `sigStrikesLandedPerMinute`
- Striking absorbed:
`sig_strikes_absorbed_per_min`, `sapm`, `sigStrikesAbsorbedPerMinute`
- Wrestling:
`takedowns_per_15`, `td_avg`, `takedown_accuracy`, `td_acc`, `takedown_defense`, `td_def`
- Submission / knockdown:
`sub_attempts_per_15`, `sub_avg`, `knockdowns_per_15`, `kd_avg`
- Control and pace:
`control_time_ratio`, `control_share`, `pace`, `engagement_rate`, `attempts_per_minute`
- Intangibles:
`fight_iq`, `durability`, `chin_rating`, `opponent_quality`, `opponentElo`
- Video game prior:
`ufc_game_rating`, `ea_ufc_overall`, `overall`, `ovr`

## Output

The event projection includes:

- `winProbHome` / `winProbAway`
- finish probabilities
- KO/TKO probabilities
- submission probabilities
- decision probability
- expected damage and control indices
- upset-risk estimate
- metadata with full fighter profile signals and pipeline notes

## Design Notes

- Opponent-adjusted form is computed directly from recent result + opponent quality fields.
- Fighter strengths/weaknesses are inferred from core stat vectors and exposed in metadata.
- Style-matchup logic (striker/grappler/mixed) adds matchup-aware edge adjustments.
- Amateur, camp, training partner, and video-game priors are bounded and cannot dominate core fight metrics.
- Market odds are used as a light nudge, not a hard override.
