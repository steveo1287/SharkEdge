import { NextResponse } from "next/server";
import { fetchMlbLiveTeamProfiles } from "@/services/simulation/mlb-live-stats-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const xKey = request.headers.get("x-api-key")?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey && !cronSecret) return true;
  return Boolean((apiKey && xKey === apiKey) || (cronSecret && bearer === cronSecret));
}

// GET /api/internal/mlb/team-analytics-feed
// Returns team-level analytics from the free MLB Stats API (ERA, OBP, SLG, wRC+ proxy, etc.)
// Set MLB_TEAM_ANALYTICS_URL=https://<host>/api/internal/mlb/team-analytics-feed
// to wire real team profiles into the simulation without needing an external paid feed.
// The normalizeRaw() in mlb-team-analytics.ts accepts all the field names returned here.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const profiles = await fetchMlbLiveTeamProfiles().catch(() => null);
  if (!profiles || !Object.keys(profiles).length) {
    return NextResponse.json({ ok: false, error: "MLB team stats unavailable — Stats API may be off-season or unreachable." }, { status: 503 });
  }

  const teams = Object.values(profiles);
  return NextResponse.json({ ok: true, source: "mlb-stats-api", teams, count: teams.length });
}
