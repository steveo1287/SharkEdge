import { NextResponse } from "next/server";
import { ingestFangraphsPlayerFeed } from "@/services/simulation/fangraphs-player-ingestion";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const url = process.env.FANGRAPHS_PLAYER_FEED_URL?.trim();
  if (!url) {
    return NextResponse.json({ ok: false, message: "Set FANGRAPHS_PLAYER_FEED_URL" });
  }
  try {
    const players = await ingestFangraphsPlayerFeed(url);
    return NextResponse.json({
      ok: true,
      source: "fangraphs",
      playerCount: players.length,
      players
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}
