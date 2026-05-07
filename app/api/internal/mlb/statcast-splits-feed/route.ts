import { NextResponse } from "next/server";
import { getAllDbStatcastSplits } from "@/services/simulation/mlb-statcast-splits";
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

// GET /api/internal/mlb/statcast-splits-feed
// Returns team-level Statcast splits aggregated from the ingested DB data.
// Set MLB_STATCAST_SPLITS_URL=https://<host>/api/internal/mlb/statcast-splits-feed
// to wire this into getMlbStatcastSplit() as the real-data source.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dbSplits = await getAllDbStatcastSplits();

  if (!dbSplits) {
    // Fall through to live profiles which at least have team names
    const liveProfiles = await fetchMlbLiveTeamProfiles().catch(() => null);
    if (!liveProfiles) {
      return NextResponse.json({ ok: false, error: "No Statcast data available — run the MLB statcast ingestion pipeline first." }, { status: 503 });
    }
    // Return empty-but-named rows so the consumer at least gets team names
    const placeholder = Object.values(liveProfiles).map((p) => ({ teamName: p.teamName, source: "estimated" }));
    return NextResponse.json({ ok: true, source: "estimated", splits: placeholder, count: placeholder.length });
  }

  const splits = Object.values(dbSplits);
  return NextResponse.json({ ok: true, source: "real", splits, count: splits.length });
}
