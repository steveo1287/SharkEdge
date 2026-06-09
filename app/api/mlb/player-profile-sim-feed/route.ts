import { NextResponse } from "next/server";

import { buildMlbPlayerProfileSimFeed } from "@/services/simulation/mlb-player-profile-sim-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function num(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const awayTeam = url.searchParams.get("away")?.trim();
  const homeTeam = url.searchParams.get("home")?.trim();
  if (!awayTeam || !homeTeam) {
    return NextResponse.json({ ok: false, error: "away_and_home_required" }, { status: 400 });
  }
  const awayRuns = num(url.searchParams.get("awayRuns"), 4.35);
  const homeRuns = num(url.searchParams.get("homeRuns"), 4.45);
  const homeWinPct = num(url.searchParams.get("homeWinPct"), 0.5);
  const data = await buildMlbPlayerProfileSimFeed({
    awayTeam,
    homeTeam,
    projection: { distribution: { avgAway: awayRuns, avgHome: homeRuns, homeWinPct, awayWinPct: 1 - homeWinPct } }
  });
  return NextResponse.json(data);
}
