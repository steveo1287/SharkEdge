import { NextResponse } from "next/server";

import { getMlbPlayerMarketOpportunities } from "@/services/simulation/mlb-player-market-opportunities";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function boolParam(url: URL, name: string, fallback = false) {
  const value = url.searchParams.get(name);
  if (value == null) return fallback;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const value = url.searchParams.get(name);
  const parsed = value ? Number(value) : fallback;
  return Math.max(min, Math.min(max, Number.isFinite(parsed) ? Math.floor(parsed) : fallback));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = numberParam(url, "limit", 75, 1, 500);
  const lookaheadHours = numberParam(url, "lookaheadHours", 72, 1, 240);
  const lookbackHours = numberParam(url, "lookbackHours", 6, 0, 72);
  const includePass = boolParam(url, "includePass", false);
  const feed = await getMlbPlayerMarketOpportunities({ limit, includePass, lookaheadHours, lookbackHours });
  return NextResponse.json({
    ...feed,
    config: { limit, includePass, lookaheadHours, lookbackHours }
  }, { status: feed.ok ? 200 : 503 });
}
