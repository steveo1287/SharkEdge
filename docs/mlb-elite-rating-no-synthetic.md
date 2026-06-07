# No synthetic MLB ratings rule

Production MLB simulation should not generate player ratings from generic `overall` values.

Allowed:

- real MLB player stats
- real Statcast-style tendencies
- real lineup and probable starter context
- real bullpen availability and workload
- historical outcome calibration
- optional low-weight game-rating prior

Not allowed for production confidence:

- fake hitters generated from a base number
- fake pitchers generated from a base number
- synthetic lineups without clear fallback labeling
- high-confidence NRFI/F5 tags from unconfirmed or stale roster data
