import type { Config } from "@netlify/functions";

import { refreshUpcomingEventIntelligence } from "../../services/intelligence/intelligence-orchestrator";

function parseLeagues(value: string | undefined) {
  return value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default async (req: Request) => {
  const { next_run } = await req.json().catch(() => ({ next_run: null }));
  const leagues = parseLeagues(Netlify.env.get("INTELLIGENCE_ORCHESTRATOR_LEAGUES") ?? undefined);
  const limit = parseLimit(Netlify.env.get("INTELLIGENCE_ORCHESTRATOR_LIMIT") ?? undefined, 30);

  console.info("[intelligence-orchestrator-scheduled] start", { next_run, leagues, limit });
  const result = await refreshUpcomingEventIntelligence({ leagues, limit });
  console.info("[intelligence-orchestrator-scheduled] done", result);
};

export const config: Config = {
  schedule: "*/15 * * * *"
};
