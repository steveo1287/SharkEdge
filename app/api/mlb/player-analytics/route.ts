import { NextResponse } from "next/server";
import { normalizeMlbPlayerRows, rowsFromMlbPlayerBody } from "@/services/simulation/mlb-player-analytics-pipeline";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function fetchUpstream() {
  const url = process.env.MLB_PLAYER_STATS_URL?.trim() || process.env.MLB_PLAYER_ANALYTICS_URL?.trim();
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function GET() {
  const upstream = await fetchUpstream();
  const rows = upstream ? normalizeMlbPlayerRows(rowsFromMlbPlayerBody(upstream)) : [];
  return NextResponse.json({
    ok: true,
    source: upstream ? "configured-player-feed" : "none",
    playerCount: rows.length,
    players: rows
  });
}
