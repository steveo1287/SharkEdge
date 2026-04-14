# SharkEdge merge report

## Base repo
- `SharkEdge-main (3).zip`

## Merged from patch zips
- Homepage/card/history/logo/headshot wiring from `SharkEdge-main-logo-prop-patched.zip`
- Shared backend URL resolver cleanup from `SharkEdge-wired-backend.zip`
- Optional simple `GameCard` component retained from `SharkEdge-wired-homepage-final.zip`

## Files added
- `frontend/app/_components/home/home-card-adapter.ts`
- `frontend/app/history/page.tsx`
- `frontend/components/home/elite-game-card.tsx`
- `frontend/components/home/elite-prop-card.tsx`
- `frontend/components/home/game-card.tsx`
- `frontend/services/backend/base-url.ts`

## Files modified
- `frontend/app/page.tsx`
- `frontend/lib/utils/entity-routing.ts`
- `frontend/services/home/home-command-service.ts`
- `frontend/.env.example`
- `frontend/app/api/ingest-odds/route.ts`
- `frontend/services/current-odds/backend-url.ts`
- `frontend/services/historical-odds/ingestion-service.ts`
- `frontend/services/odds/live-odds.ts`
- `frontend/services/odds/live-props-data.ts`
- `frontend/services/props/warehouse-service.ts`
- `frontend/services/trends/mlb-trends-data-adapters.ts`

## Conflicts resolved
- Chose the logo/headshot homepage patch over older homepage-only patches.
- Kept the real base repo source tree and removed embedded zip artifacts from the final repo.
- Kept adapters aligned to the real current domain types instead of the earlier sketch-only card shape.

## Discarded or not merged
- Embedded patch zip files were removed from the repo root.
- Earlier placeholder `GameCard` asset mapping based on an empty local registry was not used for the homepage.
- No fake score fields were invented for `GameCardView`; score UI still needs real source data if you want live scores on these homepage cards.

## Still incomplete / backend-data constraints
- Game homepage cards do not show live scores unless `GameCardView` is expanded to carry scoreboard data or is joined with a scoreboard source.
- Player/fighter headshots only appear when usable external IDs exist.
- Team logos only appear when usable team external IDs exist.

## Validation notes
- Static import/path inspection completed for the merged homepage/card/history/backend-url files.
- Syntax-level TypeScript transpilation passed for the changed files.
- Full `tsc -p frontend/tsconfig.json --noEmit` could not be used as a trustworthy gate in this container because `frontend/node_modules` is absent, so Next/React type packages are unavailable here.
