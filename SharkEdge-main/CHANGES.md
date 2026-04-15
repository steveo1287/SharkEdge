# SharkEdge — Patch Changes

## What this patch does

Three areas were fixed in this pass: repo cleanup, backend analytics wiring, and frontend URL consolidation.

---

## 1. Repo cleanup

The root of the repo had accumulated ~400 orphaned files from prior patch sessions — component copies, numbered duplicates, embedded zip artifacts — that had never been placed correctly and were not part of the Next.js app. These were all removed.

**Removed:**
- 119 orphaned root-level `.tsx` files (stale component copies)
- 277 orphaned root-level `.ts` files (stale service/worker copies)
- 13 numbered `page (N).tsx` duplicates
- 11 numbered `SKILL (N).md` duplicates
- 12 numbered `_meta (N).json` duplicates
- 5 embedded `.zip` patch delivery artifacts
- Root-level duplicate directories: `components/`, `lib/`, `scripts/`, `tests/`, `types/`
- Root-level Python duplicates of `backend/` files
- Miscellaneous junk: numbered `origin`, `clawhub`, `migration`, `README` copies

**Result:** Repo went from ~1,283 files to ~809 files. The canonical source of truth for all code is now unambiguously in `frontend/` and `backend/`.

---

## 2. Backend analytics wiring

### `backend/main.py`

**Import added:**
```python
build_top_prop_feed  # was missing from the sharkedge_analytics import
```

**`fetch_sport_prop_board()` patched:**
- Now computes `top_props = build_top_prop_feed(enriched_props)` after EV enrichment
- Returns `top_props` in the per-sport payload

**`/api/props/board` endpoint patched:**
- Now returns a cross-sport `top_props` field (top 30 props by EV, aggregated across all sports)
- Built by `build_top_prop_feed([all props], limit=30)`

**`build_game_detail()` patched:**
- Now returns `edge_analytics` at the top level of the game detail payload
- Now returns `sharp_signals` at the top level of the game detail payload
- Uses `game.get("edge_analytics") or build_game_edge_block(game)` so pre-computed values from `normalize_game()` are preferred

---

## 3. Frontend wiring

### `frontend/services/backend/base-url.ts` — NEW FILE

Canonical backend URL resolver. Priority order:
1. `SHARKEDGE_BACKEND_URL` env var (explicit override)
2. `VERCEL_PROJECT_PRODUCTION_URL` → `https://{host}/_/backend`
3. `VERCEL_URL` → `https://{host}/_/backend`
4. `http://127.0.0.1:8000` (local dev fallback)

### `frontend/services/current-odds/provider-types.ts`

Added typed fields to `CurrentOddsGame`:
- `edge_analytics?: CurrentOddsEdgeAnalytics | null` — full sharkscore + top_edges
- `sharp_signals?: Record<string, unknown> | null`
- New exported types: `CurrentOddsSharkScore`, `CurrentOddsEdgeAnalytics`

### `frontend/services/odds/live-odds.ts`

- Added `getEdgeBand` to import from `@/lib/utils/edge-score`
- Added `getBackendBaseUrl` import; replaced hardcoded URL in `fetchBackendJson()`
- **`buildLiveEdgeScore()` patched:** now checks `game.edge_analytics?.sharkscore` first. When the Python backend has computed a real SharkScore (true EV + book consensus + vig efficiency + line movement), that value drives the board card score. Falls back to the heuristic only when backend analytics are absent.

### `frontend/services/odds/live-board-data.ts`

- Added `getEdgeBand` to import
- **`buildLiveEdgeScore()` patched:** same real-sharkscore-first logic, keeping both board data paths consistent

### `frontend/services/odds/live-props-data.ts`

- Added `getBackendBaseUrl` import; replaced hardcoded URL
- Added `LiveTopProp` type
- Added `top_props?: LiveTopProp[]` to `LivePropsBoardResponse`
- **`getLivePropsExplorerData()` patched:** now collects `backendTopProps` from all responses and returns them as `topProps` in the result — EV/Kelly ranked by the Python engine

### Stale URL fixes (all services now use `getBackendBaseUrl()`)

| File | Change |
|---|---|
| `services/odds/live-odds.ts` | `fetchBackendJson` uses canonical helper |
| `services/odds/live-props-data.ts` | `fetchLivePropsBoardResponse` uses canonical helper |
| `services/historical-odds/ingestion-service.ts` | `fetchBackendJson` uses canonical helper |
| `services/props/warehouse-service.ts` | fetch call uses canonical helper |
| `services/trends/mlb-trends-data-adapters.ts` | harvest fetch uses canonical helper |
| `services/current-odds/backend-url.ts` | stale Vercel fallback URL removed |
| `app/api/ingest-odds/route.ts` | proxy uses canonical helper |

---

## How to deploy

### Local
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8000

# Frontend (separate terminal)
cd frontend
cp .env.example .env.local
# Fill in ODDS_API_KEY and DATABASE_URL at minimum
npm install
npm run dev
```

### Vercel
- Set `SHARKEDGE_BACKEND_URL` to your backend deployment URL (or leave unset to use `/_/backend` auto-routing)
- Set `ODDS_API_KEY` on the backend service
- Set `DATABASE_URL` on the frontend service
- The `vercel.json` routes frontend at `/` and backend at `/_/backend`

---

## What surfaces once deployed

With `ODDS_API_KEY` set on the backend:

1. **SharkScore on every game card** — driven by real EV, book consensus, vig efficiency, and line movement from the Python engine (not heuristics)
2. **Edge analytics on game detail pages** — `edge_analytics.top_edges`, `sharp_signals` now in the detail payload
3. **Top Props feed** — `/api/props/board` returns a cross-sport EV-ranked `top_props` list; `getLivePropsExplorerData` exposes it as `topProps`
4. **Consistent backend URL resolution** — all 7 call sites now use the same priority chain instead of scattered hardcoded fallbacks
