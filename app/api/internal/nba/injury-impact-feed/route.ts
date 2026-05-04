import { NextResponse } from "next/server";

import { getFreeNbaInjuryFeed } from "@/services/injuries/free-nba-injury-feed";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const feed = await getFreeNbaInjuryFeed();
  return NextResponse.json(feed, { status: feed.ok ? 200 : 503 });
}
