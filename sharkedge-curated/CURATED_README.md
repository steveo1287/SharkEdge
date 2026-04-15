# SharkEdge — Curated Source Export

This zip contains **all functional/intellectual-property code** from the SharkEdge repo,
organized for clean import. It deliberately excludes:
- Openclaw `SKILL.md` agent instruction files (those live in Openclaw, not your repo)
- Redundant root-level duplicates (except where noted)

---

## What's In Here

### `/backend/` — Python FastAPI backend
| File | Purpose |
|------|---------|
| `main.py` | Primary FastAPI app — all routes, odds ingestion, EV logic |
| `sharkedge_analytics.py` | Analytics engine — vig stripping, EV, Kelly, trend math |
| `live_odds_scraper.py` | Selenium/requests live odds scraper |
| `pinnacle_mlb_scraper.py` | Pinnacle MLB odds scraper |
| `app.py` | App entrypoint |
| `requirements.txt` | Python deps |
| `.env.example` | Backend env vars template |

---

### `/frontend/lib/` — Core library (your betting math IP lives here)
| Path | Purpose |
|------|---------|
| `lib/math/core.ts` | Vig stripping, no-vig probability, EV, Kelly sizing |
| `lib/odds/index.ts` | Odds conversion utilities |
| `lib/trends/engine.ts` | Trend matching engine (40KB — core trend IP) |
| `lib/trends/publisher.ts` | Trend publishing pipeline (48KB) |
| `lib/trends/trendMatcher.ts` | Pattern matcher |
| `lib/trends/statisticalValidator.ts` | Stat validation for trends |
| `lib/trends/context-variables.ts` | Contextual variables for trend features |
| `lib/types/opportunity.ts` | Opportunity type definitions |
| `lib/types/domain.ts` | Core domain types |
| `lib/types/ledger.ts` | Bet ledger types |
| `lib/utils/bet-intelligence.ts` | Bet intelligence utilities |
| `lib/utils/ledger.ts` | Ledger computation utilities |
| `lib/utils/edge-score.ts` | Edge scoring |
| `lib/validation/` | Zod/validation schemas |

---

### `/frontend/services/simulation/` — Game simulation engine
| File | Purpose |
|------|---------|
| `contextual-game-sim.ts` | Main contextual game simulator |
| `context-profiles.ts` | Game context profiles (weather, travel, rest, etc.) |
| `game-ratings-prior.ts` | Bayesian prior ratings engine |
| `player-prop-sim.ts` | Player prop simulation |
| `simulation-view-service.ts` | Sim results aggregation/presentation |

---

### `/frontend/services/modeling/` — MLB model
| File | Purpose |
|------|---------|
| `mlb-game-sim-service.ts` | MLB game simulation (35KB) |
| `model-engine.ts` | Generic model engine |
| `mlb-source-native-context.ts` | MLB native context pipeline |

---

### `/frontend/services/trends/` — Trends discovery & intelligence
Core algorithmic trend work. The `discovery/` subdirectory contains the beam search
trend finder. `validation/` contains out-of-sample, rolling window, and CLV checks.

Key files: `query-engine.ts` (46KB), `feature-warehouse.ts` (29KB), 
`feed-native-context.ts` (21KB), `historical-row-extractor.ts` (16KB)

---

### `/frontend/services/opportunities/` — Opportunity engine (27 files)
The full opportunity lifecycle: detection → sizing → execution → CLV tracking →
grading → portfolio management. Includes `opportunity-portfolio.ts`,
`opportunity-sizing.ts` (Kelly integration), `opportunity-execution.ts`,
`opportunity-clv-service.ts` (32KB), `opportunity-truth-calibration.ts`.

---

### `/frontend/services/edges/` — Edge detection
`edge-engine.ts` (28KB) — line comparison, sharp money signals, book consensus.

---

### `/frontend/services/odds/` — Live odds board
`live-odds.ts` (73KB), `odds-service.ts` (39KB), `live-board-data.ts` (22KB),
`live-props-data.ts`, `detail-service.ts`

---

### `/frontend/services/bets/` — Bet logger
`bets-service.ts` (51KB) — full bet tracking, CLV, performance metrics, CSV import

---

### `/frontend/services/stats/` — Stats providers
ESPN stats provider (65KB), UFC stats provider, stats service (22KB)

---

### `/frontend/services/weather/` — Weather integration
Venue-station join (29KB), weather source planner, provider registry

---

### `/frontend/app/api/` — Next.js API routes (47 routes)
All wired API endpoints. These connect frontend → backend services.

---

### `/frontend/tests/` — Test suite (19 files)
Covers: math-core, opportunity engine, market path, ledger utils, book feed
normalization, opportunity portfolio, execution, calibration

---

### `/frontend/prisma/` — Database schema + migrations
`schema.prisma` (46KB), all migrations, seed files

---

### `/packages/contracts/` — Shared TypeScript contracts
Odds, provider types, external sources, trends contracts

---

### `/tools/analytics/` — Standalone analytics scripts
`polymarket_sports_edge.py` (24KB) — Polymarket EV screener
`polymarket_markets.sh` — Market data shell script
`test_odds.py` — Odds math test harness

---

### `/tools/experimental/`
`scrape_sportsbet_upcoming.py` — Sportsbet scraper

---

### `/skills/polymarket-*/` — Polymarket edge tools
Python scripts for Polymarket EV analysis and sports market scanning

---

### `/docs/`
`sharkedge-founder-blueprint.md` — Full product roadmap/vision doc
`research/` — Polymarket research notes, analytics salvage notes

---

## Files Intentionally Excluded

| Excluded | Reason |
|----------|--------|
| `skills/*/SKILL.md` etc | Openclaw agent configs — these live in Openclaw Hub, not your repo |
| `skills/debug-pro`, `skills/react`, etc | Generic dev skills from Openclaw marketplace |
| Actual `.env` files | Git-ignored, contain secrets |
| `node_modules/`, `__pycache__/` | Build artifacts |

