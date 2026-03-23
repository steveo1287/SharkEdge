# SharkEdge MVP

Dark, premium sports betting analytics MVP built with the Next.js App Router, TypeScript, Tailwind CSS, Prisma, PostgreSQL-ready models, and Zod.

## Brand Direction

- SharkEdge is positioned as an elite betting operating system, not a casual odds toy.
- Visual language: dark navy / charcoal surfaces, premium blue action color, restrained gold highlight.
- Voice: sharp, direct, trustworthy, data-first.
- Shared brand metadata lives in `lib/brand/brand-kit.ts` so the app shell, metadata, and future marketing surfaces can stay aligned.

## Included

- `/` odds board for NBA and NCAAB
- `/game/[id]` game detail page
- `/props` props explorer
- `/bets` manual tracker
- `/performance` performance dashboard
- `/trends` coming-soon trends builder page
- reusable layout and UI components
- Prisma schema and seed source
- mock data and service layer ready for future real ingestion

## Setup

1. Install dependencies

```bash
npm install
```

2. Copy envs and set your database URL

```bash
cp .env.example .env
```

3. Generate Prisma client

```bash
npm run prisma:generate
```

4. Run migrations

```bash
npm run prisma:migrate
```

5. Seed the database

```bash
npm run prisma:seed
```

6. Start the app

```bash
npm run dev
```

## Environment Variables

- `DATABASE_URL`

## What Is Mocked

- game odds
- player props
- line movement snapshots
- standings / previous game context
- tracked bets
- performance metrics
- saved trend preview

## Architecture Notes

- `app/` contains the route pages
- `components/` holds reusable layout, feature, and UI pieces
- `lib/` contains types, validation, formatters, utilities, and Prisma client setup
- `services/` is the seam between the UI and the data source
- `prisma/` contains the schema and seed source

## Future Hooks

- sportsbook API ingestion
- team / player stats ingestion
- live game tracker
- sportsbook sync
- trends query engine
- alerting
- authentication expansion

## Current MVP Limits

- The UI runs from mock-first services today.
- The manual bet tracker is interactive in-session but not persisted through the page UI yet.
- Prisma schema and seed files are production-oriented so you can shift from mock services to real storage incrementally.
