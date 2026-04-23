# Railway Service Dockerfiles

Railway in this repo detects a root `Dockerfile` by default, which can force the wrong runtime path for web and worker services.

Use explicit per-service Dockerfile paths:

- Web service (`SharkEdge`): `deploy/railway/Dockerfile.web`
- Worker service (`odds-worker`): `deploy/railway/Dockerfile.odds-worker`

Both Dockerfiles are Node 20-based and map directly to:

- web start: `npm run start`
- worker start: `npm run worker:odds-refresh`
