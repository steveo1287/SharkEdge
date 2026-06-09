import { NextResponse } from "next/server";

import { getMlbMatchupPlayerEdges } from "@/services/players/mlb-matchup-player-edges";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = await getMlbMatchupPlayerEdges({
    away: url.searchParams.get("away"),
    home: url.searchParams.get("home")
  });
  return NextResponse.json(data);
}
