# SharkEdge

SharkEdge is the premium sportsbook analytics platform in this repo. The current milestone upgrades the product from a polished prototype into a real bet ledger with durable persistence, live bet tracking hooks, and a normalized multi-sport core that can expand into sportsbook sync later.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- Zod

## Current Scope

- Live board and matchup pages remain in place for NBA and NCAAB
- Real bet ledger with straight and parlay support
- Live sweat board for tracked bets
- Persisted performance analytics
- Normalized event / participant / leg data model
- Architecture ready for NBA, NCAAB, MLB, NHL, NFL, NCAAF, UFC, and boxing

## Setup

1. Install dependencies

```bash
npm install
```

2. Copy envs

```bash
cp .env.example .env
```

3. Generate Prisma client

```bash
npm run prisma:generate
```

4. Run migrations against Postgres

```bash
npm run prisma:migrate
```

5. Seed the catalog data

```bash
npm run prisma:seed
```

6. Start the app

```bash
npm run dev
```

7. Run the important unit tests

```bash
npm test
```


## Rescue Runtime Power Move

Use one command to force a refresh of the free ingest path, poll backend ingest status, verify the DraftKings and FanDuel feed endpoints, and fail if the NBA/MLB board still comes back empty.

```bash
npm run rescue:power
```

Useful variants:

```bash
npm run rescue:power -- --refresh=skip
npm run rescue:power -- --scrape=true
npm run rescue:power -- --leagues=NBA,MLB --timeoutSeconds=90
```

What it checks:

- `/api/ingest/odds/status`
- `/api/book-feeds/draftkings`
- `/api/book-feeds/fanduel`
- `/api/odds/board?league=NBA`
- `/api/odds/board?league=MLB`

It exits non-zero when the board still has zero verified requested-league games, so you can use it as the repo-level smoke command for this rescue pass.

## Environment Variables

- `DATABASE_URL`
  PostgreSQL connection string for Prisma. Required for bets, performance, and the normalized event ledger.
- `SHARKEDGE_BACKEND_URL`
  Existing SharkEdge backend URL for the live board and game pages.
- `ODDS_API_KEY`
  Optional when using the internal ESPN + Odds API route.

## Migration Notes

- The repo is Postgres-first. Do not use SQLite for production.
- If you previously used a one-off local Prisma schema without migrations, reset your local dev database before applying this milestone so the normalized ledger tables are created cleanly.

## What Is Real Now

- Bet persistence
- Straight and parlay legs
- Manual edit / delete / archive flow
- Performance metrics from stored bets
- Live event state sync for supported ESPN team-sport leagues
- Honest grading for moneyline, spread, and total when final scores are available

## What Is Still Mocked Or Limited

- Board and props still fall back to mock layers when live feeds are unavailable
- UFC and boxing event catalog is seeded, but live sync is not wired yet
- Player props grading stays pending unless a stat feed supports it
- CLV only shows when open and closing context is present
- Trends remains a placeholder surface

## Architecture Notes

- `prisma/schema.prisma`
  Contains the legacy board tables plus the new normalized `Sport`, `Event`, `Competitor`, `EventParticipant`, `Bet`, and `BetLeg` backbone.
- `services/events`
  Provider abstraction and normalized event sync layer.
- `services/bets/bets-service.ts`
  Ledger CRUD, shaping, and performance aggregation.
- `app/api/ledger/bets`
  Route handlers for create, update, archive, and delete.

## Future Hooks

- sportsbook account sync
- richer live trackers and alerts
- props ingestion and grading
- closing-line snapshots from live books
- fighter and team history query engine
- auth and user-owned ledgers
