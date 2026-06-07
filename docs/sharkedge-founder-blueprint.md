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

- Railway is the deployment target for the web app, API/runtime, workers, and scheduled jobs.
- Next.js runs as the Railway web service using the normal build/start scripts.
- Long-running workers run as separate Railway services using the `worker:railway:*` scripts.
- Postgres is the source of truth.
- Redis is optional in local dev and recommended in production for hot board caching and job coordination.
- Deployment health should be judged from Railway services and database readiness, not from any legacy external deployment status.

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
