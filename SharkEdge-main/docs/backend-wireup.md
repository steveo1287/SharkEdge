# SharkEdge backend wire-up

## What the Python files are

The Python files under `backend/` are real backend code, not mockups:

- `backend/app.py` exposes the ASGI entrypoint for Vercel and local Uvicorn
- `backend/main.py` defines the FastAPI app and all live odds / props / ingest routes
- `backend/pinnacle_mlb_scraper.py` builds the Pinnacle MLB snapshot used for sharp reference pricing
- `backend/props_scraper.py` handles live props scraping / ingest
- `backend/sharkedge_analytics.py` computes fair probability, vig stripping, EV, Kelly, and market scoring
- `backend/data/scraper_live_odds.json` is the scraper cache file used as a fallback provider

## What was wired in

The frontend previously had several stale backend fallbacks pointing to old deployments. Those references now resolve through a shared helper:

- `frontend/services/backend/base-url.ts`

That helper now resolves backend URLs in this order:

1. `SHARKEDGE_BACKEND_URL`
2. `NEXT_PUBLIC_SITE_URL + /_/backend`
3. Vercel deployment host + `/_/backend`
4. local fallback `http://127.0.0.1:8000`

Updated callers:

- `frontend/services/current-odds/backend-url.ts`
- `frontend/services/historical-odds/ingestion-service.ts`
- `frontend/services/trends/mlb-trends-data-adapters.ts`
- `frontend/services/props/warehouse-service.ts`
- `frontend/services/odds/live-props-data.ts`
- `frontend/services/odds/live-odds.ts`
- `frontend/app/api/ingest-odds/route.ts`
- `frontend/.env.example`

## Local run

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
uvicorn app:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Deploy note

This repo is already set up for a combined Vercel deployment using `vercel.json`:

- frontend at `/`
- Python backend at `/_/backend`

So for Vercel, you can either:

- leave `SHARKEDGE_BACKEND_URL` unset and let the app derive `/_/backend` automatically, or
- set `SHARKEDGE_BACKEND_URL` explicitly if you want the frontend to hit a separate backend deployment.
