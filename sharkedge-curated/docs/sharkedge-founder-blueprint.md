# SharkEdge Founder Blueprint

## 1. Executive Summary

SharkEdge is a sports intelligence operating system for serious bettors and sports researchers. The MVP is a zero-budget, provider-agnostic platform that combines live market data, self-archived odds history, matchup analytics, trend discovery, backtesting, player and team research, and original AI-assisted sports coverage.

The product goal is simple: users should not need to leave SharkEdge to answer the most important betting research questions.

Core product loop:
1. Discover a market, game, prop, player, or system worth researching.
2. Understand the edge through explainable market, matchup, and historical context.
3. Save, track, or act on the opportunity with alerts, watchlists, and bet logging.
4. Return because SharkEdge becomes more valuable every day as its own archive, models, and content corpus compound.

MVP thesis:
- Start with free and public data.
- Archive everything ourselves from day one.
- Keep source adapters replaceable.
- Make the UI feel premium even before premium data arrives.
- Build the internal data model and service seams now so premium providers can slot in later.

## 2. System Architecture

### 2.1 Top-Level Architecture

- `apps/web`: Next.js App Router app for desktop/mobile web and future app-store shell support.
- `apps/api`: Node TypeScript BFF for typed APIs, auth, orchestration, edge explanations, and admin surfaces.
- `services/odds-ingestion-service`: polls or streams free odds providers and sportsbook adapters.
- `services/odds-archive-service`: writes timestamped immutable market snapshots and rollups.
- `services/sports-data-service`: ingests schedules, rosters, standings, box scores, play-by-play, injuries, venues, weather, and league metadata.
- `services/analytics-service`: sport-specific derived metrics and feature engineering.
- `services/projection-service`: fair-price and projection models by league and market.
- `services/market-intelligence-service`: consensus lines, no-vig conversion, hold, stale line detection, steam moves, CLV, and market disagreement.
- `services/trends-engine-service`: trend definitions, historical scans, live matching, and explainability.
- `services/backtest-service`: validation jobs, walk-forward testing, train/test splitting, overfit detection, and result persistence.
- `services/content-ingestion-service`: article source ingestion and event clustering.
- `services/article-synthesis-service`: multi-source fact extraction and original betting-native synthesis.
- `services/boxscore-recap-service`: recap generation from box score, play-by-play, and betting outcomes.
- `services/alerting-service`: watches saved systems, prices, injuries, and watchlist entities.
- `services/source-attribution-service`: stores source lineage for content and derived facts.
- `services/external-source-intake-service`: catalog, review, approve, and isolate third-party repos and skills.
- `packages/contracts`: shared types and provider interfaces.
- `packages/database`: Prisma schema, SQL migrations, seeders, partitions, materialized views.
- `packages/config`: feature flags, environment parsing, provider registry.
- `packages/testing`: fixtures, fake adapters, integration harnesses.

### 2.2 Runtime Pattern

- Frontend renders SSR pages for high-value surfaces: home, board, game, player, team, prop, trends explorer, article pages.
- BFF serves cached, typed read models built from Postgres plus Redis.
- Ingestion and modeling jobs run out-of-band on schedules and queues.
- Immutable odds snapshots feed derived market tables and explainability payloads.
- Every recommendation is backed by explicit model inputs and market context.

### 2.3 Deployment Pattern

- Frontend on Vercel.
- API on container runtime or Vercel functions initially only for thin endpoints.
- Python analytics services containerized separately.
- Postgres is the source of truth.
- Redis is optional in local dev and recommended in production for hot board caching and job coordination.

## 3. Zero-Budget Source Map By League

These are MVP-first sources. Paid sources are intentionally deferred.

### 3.1 Cross-League Sources

| Domain | MVP Source | Use | Notes |
|---|---|---|---|
| Odds | [The Odds API](https://the-odds-api.com/) | current odds, books, markets, event IDs | Free tier exists; archive every pull because historical access is paid. |
| Odds fallback / direct adapters | sportsbook web pages where lawful and stable | supplement free odds gaps | Must be isolated and treated as fragile adapters. |
| Scores / schedules / lightweight event metadata | [ESPN site APIs](https://site.api.espn.com/) | scoreboard, schedule, injuries, summaries | Unofficial but broad coverage across major leagues. |
| Weather | [NOAA / NWS API](https://www.weather.gov/documentation/services-web-api) | venue weather, alerts, conditions | Free U.S. weather source; pair with venue geocodes. |
| News discovery | league/team RSS, Google News, ESPN/CBS/AP/Yahoo article URLs | source collection only | Do not republish; synthesize and attribute. |

### 3.2 NFL

- `nflverse` data ecosystem for play-by-play, schedules, rosters, injuries, and modeling-friendly tables.
- ESPN site APIs for scoreboard, injuries, and summaries.
- Odds provider plus self-archived snapshots.
- NOAA weather for outdoor venues.
- Travel/rest/time-zone derived internally from schedule and venue tables.

Recommended MVP metrics:
- EPA/play
- success rate
- explosive play rate
- neutral pass rate
- red-zone efficiency
- pressure/sack indicators
- pace
- rest and travel penalties

### 3.3 NCAA Football

- [CollegeFootballData](https://collegefootballdata.com/) free tier for schedules, teams, drives, advanced game/team data, and betting lines on limited free usage.
- ESPN or NCAA sources for supplemental game context and injuries where available.
- Odds archive from free provider.

Recommended MVP metrics:
- EPA/play
- success rate
- explosiveness
- havoc/disruption proxies
- pace
- field position and finishing drives
- rest/travel/weather

### 3.4 NBA

- `nba_api` for NBA stats and play-by-play style endpoints from NBA.com stats infrastructure.
- ESPN scoreboard and injury context.
- Odds archive and market intelligence layer.

Recommended MVP metrics:
- offensive/defensive efficiency
- pace
- Four Factors
- shot mix proxy
- rebounding and turnover rates
- rest and travel
- opponent style and matchup buckets

### 3.5 NCAA Men's Basketball

- [henrygd/ncaa-api](https://github.com/henrygd/ncaa-api) or a self-hosted equivalent for NCAA scores, box scores, play-by-play, standings, and rankings from ncaa.com.
- [dcstats/CBBpy](https://github.com/dcstats/CBBpy) as a scraper/reference layer for game detail retrieval keyed by ESPN IDs.
- Odds archive and line movement history.

Recommended MVP metrics:
- offensive/defensive efficiency
- pace
- Four Factors
- home/away and rest
- opponent quality buckets
- rebound and turnover edges

### 3.6 MLB

- MLB StatsAPI and Baseball Savant accessible via [pybaseball](https://github.com/jldbc/pybaseball).
- Retrosheet for long-range historical event data where needed.
- Odds archive and weather effects.

Recommended MVP metrics:
- exit velocity
- launch angle
- barrel and hard-hit rate
- pitcher whiff/chase/contact quality
- bullpen fatigue
- park factor and weather
- handedness splits

### 3.7 NHL

- NHL public endpoints documented by community references such as [coreyjs/nhl-api-py](https://github.com/coreyjs/nhl-api-py) and longstanding public NHL API usage.
- ESPN for supplemental injuries and headlines.
- Odds archive.

Recommended MVP metrics:
- expected goals proxies
- shot share / Corsi-like rates
- special teams
- goalie status context
- back-to-back and travel
- finishing regression indicators

### 3.8 UFC / MMA

- [UFC Stats](https://www.ufcstats.com/) for fighter and fight stats.
- Community scrapers such as [DavesAnalytics/UFC-Analytics-Scraper](https://github.com/DavesAnalytics/UFC-Analytics-Scraper) for ingestion patterns.
- Odds archive.

Recommended MVP metrics:
- striking differential
- takedown success and defense
- control time
- finish rate
- average fight time
- layoff length
- age curve
- weight class history

### 3.9 Source Policy

- Each source is wrapped by an adapter.
- Every adapter declares source reliability, update cadence, legal notes, and data freshness expectations.
- No provider-specific field leaks beyond adapter boundaries.

### 3.10 Approved Source Stack

#### Direct-Use Now

| Source | SharkEdge Role | Why Approved | Integration Rule |
|---|---|---|---|
| [The Odds API](https://the-odds-api.com/sports-odds-data/) | MVP current-odds spine | Best immediate path for normalized odds, books, and current markets on a zero-budget MVP. | Use as the first `OddsProvider` behind adapter contracts and archive every poll. |
| [CollegeFootballData](https://collegefootballdata.com/) | CFB-specific source | Stronger and cleaner than improvised college-football scraping. | Use free REST tier first; do not depend on paid GraphQL access. |
| [pybaseball](https://github.com/jldbc/pybaseball) | MLB analytics/data layer | Mature, MIT-licensed, and already widely used for baseball data workflows. | Keep it in analytics/data jobs, not in the web runtime hot path. |
| [henrygd/ncaa-api](https://github.com/henrygd/ncaa-api) | NCAA breadth layer | Covers schedules, scores, stats, rankings, standings, and play-by-play at zero budget. | Prefer self-hosted usage for reliability; isolate as a data-source adapter. |
| [dcstats/CBBpy](https://github.com/dcstats/CBBpy) | NCAA basketball detail helper | Useful Python-side helper for game metadata, box scores, and play-by-play. | Use in sidecar ingestion jobs, not as frontend/runtime dependency. |
| [coreyjs/nhl-api-py](https://github.com/coreyjs/nhl-api-py) | NHL-specific adapter helper | One of the cleaner free wrappers for NHL schedules, scores, and EDGE-style access. | Wrap behind a provider interface and keep payload normalization internal. |
| [georgedouzas/sports-betting](https://github.com/georgedouzas/sports-betting) | Lightweight backtest/modeling starter | Best immediate repo from the shortlist for trend scans and betting-model experimentation. | Use for research, backtesting, and adaptation; never let library shapes leak into user-facing contracts. |

#### Fork / Adapt

| Source | SharkEdge Role | Why This Is Fork/Adapt |
|---|---|---|
| [the-odds-api/samples-python](https://github.com/the-odds-api/samples-python) | Odds adapter blueprint | Great shape for reference and bootstrapping, but SharkEdge should own the final provider abstraction. |
| [sportsdataverse-js](https://github.com/sportsdataverse/sportsdataverse-js) | Broad multi-league utility layer | Valuable multi-sport coverage, but it should stay behind our provider contracts and not become the business itself. |
| NCAA self-host patterns around `ncaa-api` | Reliability / deployment pattern | Worth adapting operationally, not consuming blindly. |

#### Reference Only

| Source | Why Reference Only |
|---|---|
| [Nautilus Trader](https://github.com/nautechsystems/nautilus_trader) | Excellent event-driven architecture ideas, but far heavier than the SharkEdge MVP needs. |
| [OddsHarvester](https://github.com/jordantete/OddsHarvester) | Useful for schema and archive ideas, but scraper/proxy risk makes it a poor durable core dependency. |

#### Experimental / Conditional

| Source | Status | Rule |
|---|---|---|
| `sportsdataverse-js` ESPN-backed coverage | Approved experimental adapter | Useful for speed, but do not hard-couple SharkEdge to ESPN-dependent flows as permanent core business infrastructure. |
| UFC Stats + scraper layer | Approved with isolation | UFC Stats is canonical; any scraper layer must live in isolated ingestion workers. |

#### Do Not Build Around

- `nfl_data_py`: archived and deprecated; do not start new NFL work on it.
- Generic topic-page “surebet scanner” repos: too inconsistent to approve without repo-by-repo review.
- Demo-style betting bots or “AI picks” repos: useful for ideas at most, not production foundations.

## 4. External Free Repo / OpenClaw / ClawHub Intake Architecture

The External Source Intake Pipeline is a first-class internal system, not a side note.

### 4.1 Pipeline Stages

1. Discovery
- Search GitHub, OpenClaw, ClawHub, and curated lists.
- Tag candidates by domain: odds, sportsbook normalization, sports data, trend analysis, charting, alerts, AI workflows, simulation, scraping.

2. Qualification
- Record license, owner, stars, recent activity, issue health, runtime, maintenance burden, scraping fragility, and dependency risk.
- Determine one of four intended uses: direct dependency, fork/adapt, reference only, reject.

3. Security Gate
- Pull into a quarantined workspace.
- Static scan dependencies and shell/install scripts.
- Verify license.
- Inspect network destinations.
- Review for credential handling.
- Run only in sandbox with deny-by-default secrets.

4. Integration Design Review
- Decide whether functionality belongs in a provider adapter, sidecar worker, or internal reimplementation.
- Require a wrapper contract before any production usage.

5. Approval and Provenance
- Store reviewer, commit hash, license, approval scope, and restrictions.
- Log whether code is vendored, forked, or used only as inspiration.

6. Lifecycle Review
- Recheck on upstream changes, dependency CVEs, license changes, and product reliance changes.

### 4.2 External Repo Catalog Model

- `external_repo_catalog`
  - id
  - source_type (`github`, `openclaw`, `clawhub`, `manual`)
  - url
  - owner
  - name
  - description
  - language
  - license
  - stars
  - forks
  - open_issues
  - last_commit_at
  - discovered_at
  - category
  - intended_use
  - current_status

- `external_repo_reviews`
  - repo_id
  - reviewer
  - code_quality_score
  - security_score
  - maintainability_score
  - data_usefulness_score
  - notes
  - reviewed_commit_sha
  - reviewed_at

- `external_repo_approvals`
  - repo_id
  - approval_type (`direct`, `fork`, `reference_only`, `rejected`)
  - scope
  - restrictions
  - provenance_notes
  - approved_by
  - approved_at
  - expires_at

### 4.3 Initial Candidate Catalog

#### Approved To Adapt / Fork

| Candidate | Why | Initial Verdict |
|---|---|---|
| [swar/nba_api](https://github.com/swar/nba_api) | mature NBA stats wrapper with broad endpoint coverage | Fork/adapt patterns, not direct runtime dependency in the hot path. |
| [jldbc/pybaseball](https://github.com/jldbc/pybaseball) | established MLB/Statcast extraction ecosystem | Approved for analytics-side ingestion jobs. |
| [dcstats/CBBpy](https://github.com/dcstats/CBBpy) | NCAA basketball scraping utility with Apache-2.0 license | Good candidate for scraper inspiration and forked adapter. |
| [henrygd/ncaa-api](https://github.com/henrygd/ncaa-api) | self-hostable NCAA JSON normalization layer | Strong fork/adapt candidate for NCAA coverage. |
| [coreyjs/nhl-api-py](https://github.com/coreyjs/nhl-api-py) | documents current NHL API usage | Good reference or sidecar client basis. |

#### Approved For Reference Only

| Candidate | Why | Verdict |
|---|---|---|
| [DavesAnalytics/UFC-Analytics-Scraper](https://github.com/DavesAnalytics/UFC-Analytics-Scraper) | useful UFCStats extraction logic, but scraper fragility is high | Reference only unless reworked into isolated ingestion worker. |
| [declanwalpole/sportsbook-odds-scraper](https://github.com/declanwalpole/sportsbook-odds-scraper) | useful outcome normalization ideas | Reference only because sportsbook scraping risk is high. |
| [personal-coding/Live-Sports-Arbitrage-Bet-Finder](https://github.com/personal-coding/Live-Sports-Arbitrage-Bet-Finder) | interesting arbitrage matching ideas | Reject as direct dependency; browser automation and bet placement are not SharkEdge MVP behavior. |

#### Reject

- Any repo requiring undetected browser automation for production odds scraping as a default path.
- Any repo with unclear license.
- Any repo with hardcoded secrets or direct bet placement behavior.
- Any repo that turns SharkEdge into a thin wrapper around brittle upstream code.

## 5. Security Model For Third-Party Repo Usage

### 5.1 Core Rules

- No blind install from GitHub, OpenClaw, or ClawHub.
- No production runtime dependency on unreviewed external code.
- No third-party code gets secrets by default.
- All external code runs isolated from production credentials and production databases until approved.

### 5.2 Controls

- Sandbox execution for all candidate code.
- Static analysis of install scripts and dependency trees.
- OS/process isolation for scraper workers.
- Network allowlists by service.
- Secrets broker with per-service scope.
- Vendor reviewed code where possible instead of pulling latest upstream at runtime.
- Provenance logging per imported file or fork.
- Scheduled dependency and license rechecks.

### 5.3 Service Isolation Rules

- Scrapers and third-party adapters run in separate workers.
- The BFF and frontend never import unreviewed scraping code directly.
- The database write path is mediated by typed ingestion contracts.
- Failing third-party workers cannot cascade into board or content outages.

## 6. PRD

### 6.1 Primary Users

- Serious recreational bettors
- Research-heavy sports fans
- Quant-minded handicappers
- DFS and prop researchers
- Power users who track CLV and closing market behavior

### 6.2 User Problems

- Research is fragmented across odds sites, box score sites, news, and stats tools.
- Betting content is usually non-explainable fluff.
- Historical odds and trend context are hard to build without expensive providers.
- Player and prop research is slow and shallow.

### 6.3 MVP Value Proposition

SharkEdge gives users one place to:
- compare live and recent market prices
- understand fair price and EV
- see line movement and market context
- inspect game, team, player, and prop research
- discover historically-supported systems and today's live matches
- read original synthesis built from structured data and multiple sources
- save entities and track their own betting workflow

### 6.4 MVP Scope

Include:
- market board
- game pages
- team pages
- player pages
- prop lab v1
- EV and no-vig engine
- line movement history from self-archived snapshots
- trends engine v1
- backtests v1
- alerts/watchlists v1
- AI news summaries v1
- AI game recaps v1

Exclude from MVP hard dependency:
- paid tracking feeds
- premium bookmaker APIs
- social/community layer
- native app-specific features beyond responsive shell

### 6.5 Success Metrics

- daily returning researchers
- time on site per session
- watchlist saves per active user
- alerts created per active user
- click-through to game, prop, and player pages
- odds archive growth and source freshness
- share of sessions ending without external bounce for research tasks

## 7. Monorepo Folder Structure

```text
repo/
  apps/
    web/
    api/
    admin/
  services/
    odds-ingestion-service/
    odds-archive-service/
    sports-data-service/
    analytics-service/
    projection-service/
    market-intelligence-service/
    trends-engine-service/
    backtest-service/
    content-ingestion-service/
    article-synthesis-service/
    boxscore-recap-service/
    alerting-service/
    source-attribution-service/
    external-source-intake-service/
  packages/
    contracts/
    config/
    database/
    design-system/
    feature-flags/
    testing/
    analytics-core/
  infrastructure/
    docker/
    sql/
    observability/
  docs/
    sharkedge-founder-blueprint.md
  scripts/
  data/
    seeds/
    fixtures/
    sample-archives/
```

Current repo reality:
- existing `frontend/` can become `apps/web`
- existing `backend/` can become `apps/api` or split into services later

## 8. Database Schema

### 8.1 Core Reference Tables

- `leagues`
- `seasons`
- `venues`
- `teams`
- `players`
- `sportsbooks`
- `providers`

### 8.2 Competition Tables

- `games`
- `game_participants`
- `game_status_history`
- `injuries`
- `weather_snapshots`
- `team_game_logs`
- `player_game_logs`
- `advanced_metrics`
- `projections`

### 8.3 Market Tables

- `markets`
- `market_outcomes`
- `prop_offers`
- `odds_snapshots`
- `odds_archive_snapshots`
- `market_consensus_snapshots`
- `line_movements`
- `bet_recommendations`
- `clv_results`
- `model_explanations`

### 8.4 Content Tables

- `articles`
- `article_drafts`
- `article_publications`
- `article_source_links`
- `news_events`
- `game_recaps`
- `recap_inputs`

### 8.5 Trend / Backtest Tables

- `trend_definitions`
- `trend_filters`
- `trend_runs`
- `trend_results`
- `trend_matches`
- `backtest_jobs`
- `backtest_results`
- `strategy_validations`
- `model_runs`
- `model_versions`

### 8.6 User Workflow Tables

- `users`
- `watchlists`
- `user_saved_bets`
- `alerts`
- `user_books`
- `saved_players`
- `saved_teams`
- `saved_systems`

### 8.7 External Source Governance Tables

- `external_repo_catalog`
- `external_repo_reviews`
- `external_repo_approvals`

### 8.8 Storage Strategy

- Postgres for normalized entities.
- Partition `odds_archive_snapshots` by month and league or provider.
- Maintain materialized views for latest market state, latest game state, and active trend matches.
- Store feature vectors and model outputs with version IDs.

## 9. Provider Interface Definitions

Provider contracts are scaffolded under `packages/contracts/src` in this repo.

Rules:
- adapters return normalized entities only
- raw payloads may be archived separately for audit/debugging
- provider health and freshness are explicit fields
- errors must distinguish transient, auth, parse, upstream schema drift, and source throttling

Core interfaces:
- odds provider
- sports data provider
- news provider
- weather provider
- article synthesis provider
- external repo intake source

## 10. Trends Engine Architecture

### 10.1 Components

- `trend-definition-parser`
- `trend-filter-compiler`
- `trend-runner`
- `trend-matcher-live`
- `trend-explainer`
- `trend-validator`

### 10.2 Trend Definition Model

A saved trend is a typed rule graph made of:
- subject scope: league, seasons, markets, books
- contextual filters: home/away, line buckets, totals, rest, weather, injuries, ranks, efficiency, usage, movement, etc.
- target market selection
- metric set to compute
- validation policy

### 10.3 Execution Flow

1. Compile filters into SQL plus derived-feature conditions.
2. Query historical eligible sample.
3. Compute result set and performance statistics.
4. Run validation pipeline.
5. Persist results, warnings, and explainability.
6. Match upcoming/today entries against the same compiled logic.

### 10.4 Explainability

Each active trend match stores:
- why this matchup qualifies
- which filters matched
- sample size and seasons covered
- recent performance vs all-time performance
- market context today
- caution flags

## 11. Backtesting Methodology

### 11.1 Baseline Method

For each strategy or trend system:
- generate eligible bets only from information available at bet time
- use archived opening/current lines as-of timestamps
- lock outcome resolution to historical game completion data
- compute per-bet and portfolio metrics

### 11.2 Required Metrics

- sample size
- wins/losses/pushes
- win rate
- ROI
- net units
- average odds
- median odds
- average expected edge
- average CLV if available
- max drawdown
- longest win streak
- longest losing streak
- rolling 25/50/100 bet performance
- by season, league, book, and market

### 11.3 Validation Modes

- in-sample descriptive
- train/test split
- walk-forward validation
- season-holdout validation
- recent-window validation

## 12. Anti-Overfitting Rules

- minimum sample threshold by market class
- minimum recent sample threshold
- warning on too many simultaneous filters
- warning on low-support categorical splits
- warning on feature leakage risk
- compare all-time vs recent-season stability
- require out-of-sample performance before `validated` badge
- tag descriptive-only systems that fail predictive checks
- maintain false discovery notes for heavy filter mining

Suggested defaults:
- no `validated` badge under 100 historical bets unless a niche market explicitly overrides
- no `strong` confidence if recent-window performance diverges materially from all-time
- no system alerting until it passes freshness and sample gates

## 13. AI Content Workflow For Breaking News And Game Recaps

### 13.1 Breaking News Workflow

1. Discover articles from allowed feeds and URLs.
2. Cluster related reports into one `news_event`.
3. Extract structured facts: who, what, when, status, injury, lineup, transaction, quotes, expected effect.
4. Join SharkEdge context: player form, team metrics, game importance, schedule, market movement, prop exposure.
5. Generate article variants:
- flash summary
- deeper explainer
- why it matters
- betting impact
- player/team impact
- market movement impact
6. Store source links and attribution.
7. Publish only after plagiarism/overlap and hallucination checks.

### 13.2 Game Recap Workflow

1. Ingest final box score and play-by-play.
2. Compute betting outcomes: spread, total, props hit/miss where available.
3. Pull model pregame view and closing market context.
4. Generate:
- short recap
- full recap
- what changed the game
- best performances
- betting result recap
- model takeaways
- hidden box score note
5. Store structured recap inputs for auditability.

### 13.3 Content Safety Rules

- no single-source paraphrase product
- no copying structure from source articles
- every publication must add SharkEdge analysis or context
- retain internal provenance for all fact claims
- provide user-visible attribution where appropriate

## 14. Screen-by-Screen UX / Component Plan

### 14.1 Home

Purpose: quickest path to meaningful action.

Modules:
- best EV today
- biggest market moves
- top prop edges
- breaking news by league
- active trend matches
- watchlist changes
- user bet slip / tracked bets

### 14.2 Market Board

Purpose: the terminal-like market surface.

Columns:
- event
- league
- start time / live status
- best book and best price
- consensus price
- hold
- fair odds
- EV
- movement delta
- stale flag
- arb flag
- liquidity / confidence proxy

### 14.3 Game Page

- all books table
- movement chart
- matchup summary
- injuries
- weather / venue
- rest and travel
- model view
- trend matches
- related props
- AI preview and news context

### 14.4 Prop Lab

- filter by league/game/player/book/market
- current price grid
- fair line and fair odds
- EV
- distribution chart
- recent game log context
- matchup indicators
- movement history
- explanation card

### 14.5 Player Page

- profile and current role
- season stats
- game logs
- rolling chart
- splits
- advanced metrics
- betting trends
- prop history if available
- related news

### 14.6 Team Page

- roster and injuries
- team profile
- offense/defense metrics
- recent form
- pace/style
- home/away and situational splits
- schedule spots
- market performance trends

### 14.7 Trends Explorer

- custom filter builder
- sample summary
- results table
- validation warnings
- recent vs all-time toggle
- active matches today
- save system and alert controls

### 14.8 Content Hub

- league hubs
- breaking stories
- recaps
- explainers
- `what changed today` digest

## 15. MVP Roadmap

### Phase 1: Research Core

- normalize league/team/player/game entities
- implement odds adapter and odds archive snapshots
- ship market board
- ship game pages
- ship player and team pages v1
- ship EV/no-vig engine
- ship line movement and market history v1
- ship watchlists and alerts v1

### Phase 2: Intelligence Layer

- trends engine v1
- backtesting v1
- active trend matching
- AI news summaries
- AI recaps
- prop lab v1
- CLV tracking from archived close snapshots

### Phase 3: Moat Layer

- stronger sport-specific models
- walk-forward validation UI
- better prop distributions
- richer content digests
- premium adapters behind feature flags

## 16. Starter Code Scaffolding For The Monorepo

Scaffolded in this repo now:
- `packages/contracts/src/provider-types.ts`
- `packages/contracts/src/odds.ts`
- `packages/contracts/src/trends.ts`
- `packages/contracts/src/external-sources.ts`

These files define the stable interfaces we should build services against before deeper rewrites.

## 17. Mock / Seed Data Strategy For Local Development

- keep a deterministic `sample-archives` dataset per league
- include a few real-shaped games, books, odds paths, injuries, weather snapshots, and trend definitions
- snapshot representative prop offers and line movements
- include source-health failure fixtures to test graceful degradation
- seed one week of board data plus one season slice for trend/backtest local work
- preserve raw payload fixtures beside normalized fixtures for adapter tests

Local fixture packs:
- `nfl-week-slate.json`
- `nba-gameday.json`
- `mlb-props-sample.json`
- `ufc-card.json`
- `trend-systems-sample.json`
- `news-cluster-sample.json`

## 18. TODO Markers For Paid / Premium Upgrades

Use explicit feature flags and adapter placeholders.

- `TODO(premium-odds)`: swap or augment free odds source with premium feed
- `TODO(premium-player-props)`: richer prop book and historical prop archive
- `TODO(premium-tracking)`: official or paid tracking data for deeper models
- `TODO(premium-news)`: broader licensed source pool where lawful
- `TODO(premium-sharp-market)`: add sharper reference books and market maker feeds
- `TODO(premium-alerts)`: SMS / push / richer alert routing
- `TODO(premium-betting-sync)`: sportsbook account sync and automated CLV grading

## Implementation Notes For This Repo

1. The existing `frontend/` already contains significant product work and should be treated as the seed of `apps/web`, not thrown away wholesale.
2. The next best build move is to refactor the current shell and data surfaces around the architecture above, starting with:
- market board as the center of gravity
- game page and prop lab as the second layer
- player and team pages as research depth
- trends and content as compounding retention loops
3. The current repo should be migrated incrementally, not via big-bang rewrite.
