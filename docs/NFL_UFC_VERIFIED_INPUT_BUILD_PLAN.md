# NFL + UFC Verified Input Build Plan

## Objective
Bring NFL and UFC to the same SharkEdge standard already used by MLB: official event identity, verified participants, deep true-talent inputs, freshness tracking, fail-closed simulation gates, immutable snapshots, and official result settlement.

MLB remains untouched while this work is built and validated.

## Phase 1 — Shared verification contract (STARTED)

### Deliverables
- Shared sport input audit contract.
- Per-field state: VERIFIED / PARTIAL / MISSING / STALE.
- Required vs optional evidence.
- Data grade and READY / LIMITED / BLOCKED state.
- UFC-specific gate.
- NFL-specific gate.

### Exit criteria
- A UFC bout cannot be labeled READY if required identity, rules, sample, striking, wrestling, grappling or control inputs are absent.
- NFL final simulation cannot be labeled READY until roster, inactive status, starting QB and starter groups are verified.

## Phase 2 — UFC source and profile rebuild

### Event contract
Verify and persist:
- event ID
- bout ID
- date/time
- venue
- fighter IDs
- fighter names
- weight class
- scheduled rounds
- bout status

### Fighter performance contract
Persist measured historical evidence rather than generic 0–100 values:
- significant strikes landed/min
- significant strikes absorbed/min
- significant-strike attempts/min
- accuracy
- defense
- head/body/leg distribution
- distance/clinch/ground distribution
- takedown attempts/15
- takedowns/15
- takedown accuracy
- takedown defense
- control-time share
- control retention/escape evidence
- submission attempts/15
- knockdowns/15
- finish history
- KO-loss history
- submission-loss history
- fight duration
- round-by-round pace
- late-round performance
- days since last fight
- opponent-adjusted strength

### Critical repair
Remove precise generic defaults from the UFC auto-builder. Missing evidence must remain missing or be represented by a deliberately wide prior with an uncertainty flag. Do not silently replace absent performance data with league-average-looking exact values.

### Sample rules
- Full fighter-prop publication: require the complete critical performance set for both fighters.
- Limited sample: use wide weight-class priors and increased variance.
- No meaningful history: block detailed props; winner simulation may run only in LIMITED state if identity/rules/context are verified.

## Phase 3 — UFC simulator calibration

Convert measured profile inputs into calibrated simulation rates:
- striking exchange opportunity rate
- strike attempt and land rates
- knockdown hazard
- takedown entry rate
- takedown success probability
- control acquisition/retention
- escape/get-up probability
- submission-entry probability
- finish conversion
- damage accumulation
- stamina decline/recovery

Use action cooldowns/exchange windows rather than allowing every action every second.

Run at least 10,000 deterministic paths for published fights. Store model version, input hash, path count and seed.

## Phase 4 — NFL official event + personnel pipeline

### Game verification
Persist:
- official game ID
- date/time
- home/away teams
- stadium
- roof/surface
- game status

### Progressive personnel locks
1. Early-week roster/depth baseline.
2. Injury-report refresh.
3. Final injury designation.
4. 90-minute inactive-list lock — NFL equivalent of MLB confirmed-lineup lock.

### Required final-lock personnel
- active roster
- inactive list
- starting QB
- offensive-line starters
- RB/WR/TE role hierarchy
- defensive starters
- specialist availability

## Phase 5 — NFL deep player/team profiles

### QB
EPA/play, success rate, CPOE, pressure vs clean-pocket performance, sack rate, scramble rate, ADOT, deep rate, turnover tendency, red-zone efficiency, play action.

### RB
carry share, rush EPA, yards after contact, explosive-run rate, missed/broken tackles, route/target share, goal-line share, pass protection.

### WR/TE
snap share, route participation, target share, targets/route, yards/route, ADOT, catch rate, YAC, red-zone share, alignment.

### OL/DL and defense
pressure rate, sack conversion, run blocking, run defense, tackles for loss, missed tackles, blitz rate, man/zone tendencies, explosive plays allowed, red-zone defense.

### Team/scheme
pace, situation-neutral pace, PROE, personnel usage, formation/tendency splits, coverage/blitz tendencies, pressure, explosive-play profile.

Opportunity and talent must remain separate inputs.

## Phase 6 — Environment and matchup interaction

NFL:
- wind
- temperature
- precipitation
- roof state
- surface
- travel/rest
- home field

UFC:
- weight class
- 3 vs 5 rounds
- main event/title designation
- short notice when verified
- weight-class change when verified
- layoff
- stance/style interactions

## Phase 7 — Immutable prediction snapshots

NFL checkpoints:
- early-week baseline
- final injury-report run
- inactive-lock run

UFC checkpoints:
- card baseline
- fight-week run
- post-weigh-in run when supported
- event-day verified run

Each snapshot stores the exact input state, model version, seed/path count and output distribution.

## Phase 8 — Official settlement and calibration

NFL grade:
- winner
- score distribution
- team totals
- QB/RB/WR/TE stat means
- interval coverage
- touchdown probabilities

UFC grade:
- winner
- method
- round
- fight duration
- strike/takedown/control projections where published

Use Brier/log loss for probabilities, MAE/coverage for player/fighter distributions, and walk-forward challenger testing. Never promote a model because of a short hot streak.

## Execution order

1. Shared verified-input contract — implemented.
2. UFC verified-input gate — implemented.
3. NFL verified-input gate — implemented.
4. Wire UFC gate into profile hydration and published simulation output.
5. Remove UFC precise generic defaults and add wide-prior metadata.
6. Repair UFC source parsing/history ingestion.
7. Add UFC immutable snapshots + settlement.
8. Build NFL event/roster/injury/inactive ingestion.
9. Build NFL player/team profile warehouse.
10. Wire NFL gate into snap-by-snap simulator.
11. Add NFL immutable snapshots + settlement.
12. Expose the same visible ingestion matrix/data grade used by MLB.

## Non-negotiable safeguards

- Do not modify the working MLB ingestion/simulation pipeline while implementing NFL/UFC adapters.
- No fake confidence from missing data.
- No precise generic fighter/player ratings when evidence is missing.
- Missing required evidence blocks publication rather than being hidden.
- Every published prediction must be reproducible from its saved inputs.
