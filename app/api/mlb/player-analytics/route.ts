import { NextResponse } from "next/server";
import { buildInternalFangraphsCompatibleFeed } from "@/services/mlb/mlb-internal-analytics-feeds";
import { ingestFangraphsPlayerFeed } from "@/services/simulation/fangraphs-player-ingestion";
import { normalizeMlbPlayerRows, rowsFromMlbPlayerBody, type MlbPlayerAnalyticsRow } from "@/services/simulation/mlb-player-analytics-pipeline";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlayerAnalyticsUpstream =
  | { source: "fangraphs"; players: MlbPlayerAnalyticsRow[] }
  | { source: "configured-player-feed"; body: unknown };

async function fetchUpstream(): Promise<PlayerAnalyticsUpstream | null> {
  const fangraphsUrl = process.env.FANGRAPHS_PLAYER_FEED_URL?.trim();
  if (fangraphsUrl) {
    const players = await ingestFangraphsPlayerFeed(fangraphsUrl);
    if (players.length) return { source: "fangraphs", players };
  }
  const url = process.env.MLB_PLAYER_STATS_URL?.trim() || process.env.MLB_PLAYER_ANALYTICS_URL?.trim();
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return { source: "configured-player-feed", body: await res.json() };
  } catch {
    return null;
  }
}

export async function GET() {
  const upstream = await fetchUpstream();
  const rows: Array<MlbPlayerAnalyticsRow & { source?: string }> = upstream && "players" in upstream
    ? upstream.players
    : upstream
      ? normalizeMlbPlayerRows(rowsFromMlbPlayerBody(upstream.body))
      : await buildInternalFangraphsCompatibleFeed();
  return NextResponse.json({
    ok: true,
    source: upstream?.source ?? "mlb-data-api-derived",
    playerCount: rows.length,
    players: rows
  });
}
