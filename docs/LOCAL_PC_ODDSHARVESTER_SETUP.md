# Local PC OddsHarvester Setup

This path moves the heavy OddsHarvester work off the free Render web service and runs it on your local Windows PC instead.

## What was added

- `scripts/local_oddsharvester_push.py`
- `scripts/run_local_oddsharvester_loop.ps1`
- `scripts/run_local_oddsharvester_once.ps1`
- `scripts/install_local_oddsharvester_task.ps1`
- `.env.local-oddsharvester.example`

## Easiest setup

1. Copy:

```powershell
Copy-Item .env.local-oddsharvester.example .env.local-oddsharvester
```

2. Edit `.env.local-oddsharvester` and fill in your real backend API key.

The PowerShell runners will auto-load that file.

## Example env file

```text
SHARKEDGE_BACKEND_URL=https://shark-odds-1.onrender.com
SHARKEDGE_API_KEY=replace_with_your_backend_x_api_key
ODDSHARVESTER_COMMAND=python -m oddsharvester
POST_TO_BACKEND=true
ODDSHARVESTER_TIMEOUT_SECONDS=120
ODDSHARVESTER_HEADLESS=true
```

## Run once

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_local_oddsharvester_once.ps1
```

## Run in a loop

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_local_oddsharvester_loop.ps1
```

That script will:

1. create `.venv` if needed
2. install `requests` and `oddsharvester`
3. run the harvester
4. push odds into the backend ingest endpoint
5. sleep 15 minutes and repeat

## Install a Windows scheduled task

To make it run automatically every 15 minutes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install_local_oddsharvester_task.ps1
```

That installs a task named:

- `SharkEdge Local OddsHarvester`

## Output

Harvested payloads are also written locally to:

- `./tmp/oddsharvester-output/*.json`

## Important note

This local path removes the heavy browser/scraper load from Render, but the backend ingest contract still needs to preserve the top-level odds fields cleanly for the board to fully trust pushed cache data.
