import type { Context, Config } from "@netlify/functions";

import { refreshEventIntelligence, refreshUpcomingEventIntelligence } from "../../services/intelligence/intelligence-orchestrator";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLeagues(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return undefined;
}

function parseLimit(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async (req: Request, _context: Context) => {
  const body = await req.json().catch(() => ({}));
  const payload = isRecord(body) ? body : {};
  const eventId = typeof payload.eventId === "string" ? payload.eventId.trim() : "";

  if (eventId) {
    console.info("[intelligence-refresh-background] single-event:start", { eventId });
    const result = await refreshEventIntelligence(eventId);
    console.info("[intelligence-refresh-background] single-event:done", result);
    return;
  }

  const leagues = parseLeagues(payload.leagues);
  const limit = parseLimit(payload.limit, 25);
  console.info("[intelligence-refresh-background] batch:start", { leagues, limit });
  const result = await refreshUpcomingEventIntelligence({ leagues, limit });
  console.info("[intelligence-refresh-background] batch:done", result);
};

export const config: Config = {
  path: "/api/internal/intelligence/refresh"
};
