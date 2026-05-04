import { NextResponse } from "next/server";

import { getFreeNbaInjuryFeed } from "@/services/injuries/free-nba-injury-feed";
import { getNbaPlayerImpactFeedHealth } from "@/services/simulation/nba-player-impact";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [health, freeFeed] = await Promise.all([
    getNbaPlayerImpactFeedHealth(),
    getFreeNbaInjuryFeed().catch(() => null)
  ]);
  return NextResponse.json({
    ...health,
    freeFeed: freeFeed
      ? {
          ok: freeFeed.ok,
          generatedAt: freeFeed.generatedAt,
          lastUpdatedAt: freeFeed.lastUpdatedAt,
          playerCount: freeFeed.players.length,
          officialNba: freeFeed.sources.officialNba,
          espn: freeFeed.sources.espn,
          warnings: freeFeed.warnings
        }
      : null
  });
}
