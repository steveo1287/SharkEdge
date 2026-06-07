# MLB real player ratings pipeline

## Goal

Remove synthetic MLB player ratings from the simulator path and feed the NRFI, YRFI, F5, full-game, pitcher-outs, pitcher-K, hitter-stat, and team-strength models from real player production.

## Source hierarchy

1. **Daily MLB roster, probable starter, and lineup context**
   - MLB Stats API / MLB.com probable pitchers and lineup pages.
   - Use MLBAM `personId` as the primary player key.
2. **Real production and tendency stats**
   - Statcast / Baseball Savant for batted-ball, pitch, handedness, launch, velocity, barrel, hard-hit, and event fields.
   - FanGraphs-style advanced batting/pitching rows for wRC+, FIP, K-BB%, GB%, etc.
   - Retrosheet ledger for historical game outcomes and calibration.
3. **Optional game-rating prior**
   - MLB The Show / ShowZone / ShowDD ratings can be used only as a low-weight prior for missing or noisy traits.
   - Do not let game ratings override real MLB production.

## New code

- `services/simulation/mlb-real-player-ratings.ts`
  - Converts real hitter and pitcher stat rows into `MlbProjectionRating` objects.
  - Preserves `metrics_json.sourceKind = "REAL_STATS"` so board/debug output can detect fake data.
  - Blends MLB The Show ratings only through `theShowPriorWeight`, capped at 25%.
  - Exports `buildMlbTeamContextFromRealRatings()` so confirmed lineups and probable starters can be passed directly into the existing player-stat/inning engine.

- `tests/mlb-real-player-ratings.test.ts`
  - Builds real-stat-shaped hitter/pitcher ratings.
  - Feeds those ratings into `projectMlbPlayerStatsForGame()`.
  - Feeds team/player scores into `projectMlbInningMarkets()` for NRFI/YRFI/F5 validation.

## Rating mapping

### Hitters

| SharkEdge rating | Real inputs |
| --- | --- |
| `contact` | AVG, xBA, hit/PA, K%, whiff% |
| `power` | ISO, SLG, xSLG, HR/PA, barrel%, hard-hit% |
| `discipline` | BB%, OBP, chase%, K%, xwOBA, wRC+ |
| `vs_lhp` / `vs_rhp` | Handedness split rows when available; otherwise blended contact/power/discipline |
| `baserunning` | sprint speed, steal attempt rate, steal success rate |
| `current_form` | rolling OPS/wOBA when available; otherwise season skill blend |
| `overall` | weighted offensive composite used by the sim |

### Pitchers

| SharkEdge rating | Real inputs |
| --- | --- |
| `xera_quality` | xERA, ERA, WHIP |
| `fip_quality` | FIP, HR/9, K-BB% |
| `k_bb` | K%, BB%, K-BB%, K/9, BB/9 |
| `hr_risk` | HR/9 risk where lower is better |
| `groundball_rate` | GB% |
| `platoon_split` | Left/right split stability |
| `stamina` | IP/start |
| `recent_workload` | last-7-day pitch workload |
| `arsenal_quality` | CSW%, swinging-strike%, fastball velo, K/9 |

## Runtime wiring

1. Build or fetch daily hitter rows, pitcher rows, handedness split rows, and optional The Show prior rows.
2. Run `buildMlbRealPlayerRatings()`.
3. Build each matchup with `buildMlbTeamContextFromRealRatings()` using confirmed/probable lineups.
4. Pass team contexts into `projectMlbPlayerStatsForGame()`.
5. Pass offense/starter/bullpen scores into `projectMlbInningMarkets()`.
6. Reject or mark low-confidence any game where:
   - fewer than 7 projected hitters match a team,
   - no confirmed/probable starter matches,
   - `metrics_json.sourceKind !== "REAL_STATS"` for core lineup pieces,
   - lineup is unconfirmed within the final pregame window.

## Recommended source buildout

### Phase 1: no-paid-data production path

- MLB Stats API / MLB.com: teams, rosters, probable starters, schedule, gamePk, player IDs.
- Baseball Savant CSV / Statcast: pitch-level and batted-ball metrics.
- pybaseball: local/backfill convenience for Statcast, Baseball Reference, FanGraphs-style batting/pitching pulls.
- Retrosheet: final score and inning ledgers for calibration/backtesting.

### Phase 2: paid or semi-paid enhancement

- SportsDataIO, Sportradar, or another licensed feed for stable lineups, injuries, transactions, depth charts, and probable pitchers if we need commercial-grade uptime.

### Phase 3: model hardening

- Store daily ratings snapshots so the sim can be audited later.
- Compare closing-market no-vig probabilities against SharkEdge pregame probabilities.
- Calibrate NRFI/YRFI and F5 outputs separately from full-game moneyline.
- Add park, weather, umpire zone, catcher framing, bullpen availability, and travel/schedule layers after the player-rating feed is stable.
