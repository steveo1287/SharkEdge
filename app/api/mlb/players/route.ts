import { NextResponse } from "next/server";

import { getMlbPlayerProfiles } from "@/services/players/mlb-player-profiles";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const data = await getMlbPlayerProfiles({
    q: url.searchParams.get("q"),
    team: url.searchParams.get("team"),
    role: url.searchParams.get("role"),
    limit: Number(url.searchParams.get("limit") ?? "80")
  });
  return NextResponse.json(data);
}
