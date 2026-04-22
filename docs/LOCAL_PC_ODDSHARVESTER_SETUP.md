# Local PC OddsHarvester Setup

This path makes your Windows PC the active OddsHarvester worker for SharkEdge instead of EC2.

## Files

- `scripts/bootstrap_local_oddsharvester.ps1`
- `scripts/local_oddsharvester_push.py`
- `scripts/run_local_oddsharvester_once.ps1`
- `scripts/run_local_oddsharvester_loop.ps1`
- `scripts/install_local_oddsharvester_task.ps1`
- `.env.local-oddsharvester.example`

## Default local worker env

```text
SHARKEDGE_BACKEND_URL=https://shark-odds-1.onrender.com
SHARKEDGE_API_KEY=replace_with_your_backend_x_api_key
ODDSHARVESTER_COMMAND=python -m oddsharvester
POST_TO_BACKEND=true
ODDSHARVESTER_TIMEOUT_SECONDS=120
ODDSHARVESTER_HEADLESS=true
BEST_EFFORT_CONTINUE=true
ENABLED_SPORT_KEYS=basketball_nba,baseball_mlb
```

## One-time bootstrap

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap_local_oddsharvester.ps1
```

That script will:

1. install Python 3.12 with `winget` if needed
2. create `.venv`
3. install `requests` and `oddsharvester`
4. install Playwright Chromium
5. create `.env.local-oddsharvester` from the example if it is missing

## Configure the API key

Edit `.env.local-oddsharvester` and replace:

- `SHARKEDGE_API_KEY=replace_with_your_backend_x_api_key`

with your real backend ingest key.

## Run once

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_local_oddsharvester_once.ps1
```

## Run continuously

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_local_oddsharvester_loop.ps1
```

## Install the scheduled task

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_local_oddsharvester_task.ps1
```

That installs a task named:

- `SharkEdge Local OddsHarvester`

## Local output

Harvested payloads are written to:

- `./tmp/oddsharvester-output/*.json`
