# SharkEdge UI reset

Implemented a local rebuild pass focused on replacing the dashboard feel with a board-first trading product shell.

## Changed surfaces
- New desktop/mobile app shell and navigation
- Home route now redirects to `/board`
- Rebuilt `/board` as a ranked opportunity surface with filters, movement rail, and inspector
- Rebuilt `/game/[id]` as an event hub with thesis cards, simulation, trends, and execution sidebar
- Rebuilt `/trends` as an evidence engine instead of a generic trend feed
- Rebuilt `/bets` into a portfolio surface with open exposure, pending ideas, and recent grading
- Added new edge-panel utility styles in `app/globals.css`

## Files changed
- `frontend/app/page.tsx`
- `frontend/app/board/page.tsx`
- `frontend/app/game/[id]/page.tsx`
- `frontend/app/trends/page.tsx`
- `frontend/app/bets/page.tsx`
- `frontend/app/globals.css`
- `frontend/components/layout/navigation.ts`
- `frontend/components/layout/sidebar.tsx`
- `frontend/components/layout/header.tsx`
- `frontend/components/layout/app-shell.tsx`
- `frontend/components/layout/shell-summary.tsx`
- `frontend/components/mobile/mobile-bottom-nav.tsx`

## Validation status
Validation could not be completed in the container because the uploaded repo snapshot does not include `node_modules`, and dependency install was not available from this environment. The first check failed before TypeScript compilation because `next/dist/bin/next` was missing locally.

Recommended next step in a normal dev environment:
1. `cd frontend`
2. `npm install`
3. `npm run typecheck`
4. `npm run build`
