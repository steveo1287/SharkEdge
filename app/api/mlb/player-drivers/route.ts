import { NextResponse } from "next/server";

import { getMlbPlayerMarketDrivers } from "@/services/players/mlb-player-market-drivers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = await getMlbPlayerMarketDrivers({
    market: url.searchParams.get("market"),
    team: url.searchParams.get("team"),
    limit: Number(url.searchParams.get("limit") ?? "40")
  });
  return NextResponse.json(data);
}
