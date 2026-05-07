import { NextResponse } from "next/server";
import { getMlbDataApiLeaguePlayerProfiles } from "@/services/mlb/mlb-data-api-feed";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
export const runtime = "nodejs";

function isAuthorized(request: Request) {
  const apiKey = process.env.INTERNAL_API_KEY?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();
  const xKey = request.headers.get("x-api-key")?.trim();
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey && !cronSecret) return true;
  return Boolean((apiKey && xKey === apiKey) || (cronSecret && bearer === cronSecret));
}

// GET /api/internal/mlb/player-analytics-feed
// Returns all 30 MLB teams' player profiles derived from the free MLB Stats API.
// Field names match what fangraphsToPlayerRow() and normalizeRaw() already accept,
// so ingestFangraphsPlayerFeed() will parse this correctly.
// Set FANGRAPHS_PLAYER_FEED_URL=https://<host>/api/internal/mlb/player-analytics-feed
// to switch the player model from synthetic/estimated to Stats-API-derived.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const players = await getMlbDataApiLeaguePlayerProfiles();
    if (!players.length) {
      return NextResponse.json({ ok: false, error: "No player profiles available from MLB Stats API." }, { status: 503 });
    }
    return NextResponse.json({ ok: true, source: "mlb-stats-api", players, count: players.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
