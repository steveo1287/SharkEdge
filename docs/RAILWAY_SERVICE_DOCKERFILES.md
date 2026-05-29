# Railway Service Dockerfiles

Railway currently resolves builds from the root `Dockerfile` in this project.
To keep both services correct under that behavior, the root Dockerfile is service-aware.

If Railway resolves the root `Dockerfile`, set this environment variable per Railway service:

- Web service (`SharkEdge`): `SHARKEDGE_SERVICE_MODE=web`
- Legacy odds recompute worker: `SHARKEDGE_SERVICE_MODE=odds-worker`
- Sim snapshot worker: `SHARKEDGE_SERVICE_MODE=sim-worker`
- MLB odds-api.io worker: `SHARKEDGE_SERVICE_MODE=mlb-odds-worker`
- UFC autopilot worker: `SHARKEDGE_SERVICE_MODE=ufc-worker`
- Maintenance worker: `SHARKEDGE_SERVICE_MODE=maintenance-worker`

Runtime mapping:

- `web` -> `npm run start`
- `odds-worker` -> `npm run worker:odds-refresh`
- `sim-worker` -> `npm run worker:railway:sim`
- `mlb-odds-worker` -> `npm run worker:railway:mlb-odds`
- `ufc-worker` -> `npm run worker:railway:ufc`
- `maintenance-worker` -> `npm run worker:railway:maintenance`

The `deploy/railway/` Dockerfiles remain in the repo for explicit service-path targeting if Railway service-level Dockerfile selection is enabled in your workspace later.

Additional dedicated worker Dockerfile:

- OddsHarvester Python worker: `deploy/railway/Dockerfile.oddsharvester-worker`

Explicit service Dockerfiles:

- Web: `deploy/railway/Dockerfile.web`
- Sim snapshots: `deploy/railway/Dockerfile.sim-worker`
- MLB odds-api.io: `deploy/railway/Dockerfile.mlb-odds-worker`
- UFC autopilot: `deploy/railway/Dockerfile.ufc-worker`
- Maintenance: `deploy/railway/Dockerfile.maintenance-worker`
- Legacy odds recompute: `deploy/railway/Dockerfile.odds-worker`
