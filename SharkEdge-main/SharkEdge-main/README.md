# SharkEdge hard reset pack

This pack is a replacement pass, not an incremental polish pass.

## Replaced files
- `frontend/app/page.tsx`
- `frontend/app/board/page.tsx`
- `frontend/app/game/[id]/page.tsx`
- `frontend/app/globals.css`
- `frontend/components/layout/app-shell.tsx`
- `frontend/components/mobile/mobile-bottom-nav.tsx`
- `frontend/components/board/live-edge-board-card.tsx`

## What changed
- stronger visual hierarchy
- less dashboard symmetry
- more aggressive board cards
- harder shell frame and mobile nav
- home/board/game pages pushed toward one connected betting terminal
- preserved current service/data wiring where possible so this is still grounded in the existing repo

## Apply order
1. keep the earlier weather typing fix applied
2. extract this pack into the repo root
3. run:
   - `npm install`
   - `npm run build`
4. fix the first compiler error, then continue iterating from there

## Intent
This pass is aimed at:
- conviction
- density
- identity
- better product flow

It is deliberately more forceful than the earlier passes.
