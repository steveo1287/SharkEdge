# Railway Service Dockerfiles

Railway currently resolves builds from the root `Dockerfile` in this project.
To keep both services correct under that behavior, the root Dockerfile is service-aware.

Set this environment variable per Railway service:

- Web service (`SharkEdge`): `SHARKEDGE_SERVICE_MODE=web`
- Worker service (`odds-worker`): `SHARKEDGE_SERVICE_MODE=odds-worker`

Runtime mapping:

- `web` -> `npm run dev`
- `odds-worker` -> `npm run worker:odds-refresh`

The `deploy/railway/` Dockerfiles remain in the repo for explicit service-path targeting if Railway service-level Dockerfile selection is enabled in your workspace later.
