# Local PC OddsHarvester Setup

This path moves the heavy OddsHarvester work off the free Render web service and runs it on your local Windows PC instead.

## What was added

- `scripts/local_oddsharvester_push.py`
- `scripts/run_local_oddsharvester_loop.ps1`

## Required environment variables

Set these in PowerShell before running the loop:

```powershell
$env:SHARKEDGE_BACKEND_URL = "https://shark-odds-1.onrender.com"
$env:SHARKEDGE_API_KEY = "your_backend_x_api_key_here"
$env:ODDSHARVESTER_COMMAND = "python -m oddsharvester"
$env:POST_TO_BACKEND = "true"
```

## Start the runner

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

## Output

Harvested payloads are also written locally to:

- `./tmp/oddsharvester-output/*.json`

## Important note

This local path removes the heavy browser/scraper load from Render, but the backend ingest contract still needs to preserve the top-level odds fields cleanly for the board to fully trust pushed cache data.
