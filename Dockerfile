FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

COPY . .

# Keep build artifacts ready for the web runtime.
RUN npm run build

ENV NODE_ENV=production
# web | odds-worker | sim-worker | mlb-odds-worker | ufc-worker | maintenance-worker
ENV SHARKEDGE_SERVICE_MODE=web

CMD ["sh", "-lc", "case \"$SHARKEDGE_SERVICE_MODE\" in odds-worker) npm run worker:odds-refresh ;; sim-worker) npm run worker:railway:sim ;; mlb-odds-worker) npm run worker:railway:mlb-odds ;; ufc-worker) npm run worker:railway:ufc ;; maintenance-worker) npm run worker:railway:maintenance ;; *) npx prisma migrate deploy && npm run start -- -p ${PORT:-3000} ;; esac"]
