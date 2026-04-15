# SharkEdge UI Overhaul Patch Notes

## What changed

- Reworked major homepage surfaces to behave like a command center instead of a shallow feed.
- Added a new `SimulationSpotlightCard` and surfaced the simulation engine on the homepage and board.
- Reworked board cards to use team logos, denser market presentation, clearer actions, and sharper visual hierarchy.
- Improved home movement cards and trend cards so they explain why the signal matters now.
- Upgraded prop cards with player headshots, team/opponent identity, EV/fair line/confidence blocks, and stronger CTA layout.
- Reworked the trends page into a real desk with hero metrics, scope chips, and direct board/props handoff.
- Upgraded team badge visuals to improve logo fallback quality and general polish.

## Files touched

- `frontend/app/page.tsx`
- `frontend/app/board/page.tsx`
- `frontend/app/trends/page.tsx`
- `frontend/app/_components/home-primitives.tsx`
- `frontend/components/board/game-card.tsx`
- `frontend/components/board/live-edge-board-card.tsx`
- `frontend/components/game/prop-list.tsx`
- `frontend/components/home/mobile-trend-card.tsx`
- `frontend/components/identity/team-badge.tsx`
- `frontend/components/intelligence/simulation-spotlight-card.tsx` (new)

## Validation note

- I ran syntax-level TS/TSX checks on the patched files.
- I was not able to complete a full repo build/test pass in this container because the project toolchain dependencies were not fully installed here.
