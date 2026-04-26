import { NextResponse } from "next/server";
import { ingestTeamStats } from "@/services/stats/team-stats-ingestion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return false;
  return bearer === cronSecret;
}

// Called by vercel.json cron or external scheduler (e.g. Railway cron)
// Runs nightly: fetches completed games from the last 3 days and upserts TeamGameStat records.
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const results = await ingestTeamStats({ leagues: ["MLB", "NBA"], lookbackDays: 3 });

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stats cron failed";
    console.error("[cron/stats-ingest]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
