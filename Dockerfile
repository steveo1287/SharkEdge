FROM node:20-bookworm-slim AS base

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci --include=dev

COPY . .

# Keep build artifacts ready for the web runtime.
RUN npm run build

ENV NODE_ENV=production
# web | odds-worker
ENV SHARKEDGE_SERVICE_MODE=web

CMD ["sh", "-lc", "if [ \"$SHARKEDGE_SERVICE_MODE\" = \"odds-worker\" ]; then npm run worker:odds-refresh; else npm run start -- -p ${PORT:-3000}; fi"]
