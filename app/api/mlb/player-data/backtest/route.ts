import { NextResponse } from "next/server";

import { getMlbPlayerRatingBacktest } from "@/services/players/mlb-player-rating-backtest";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const seasonRaw = Number(url.searchParams.get("season"));
  const limitRaw = Number(url.searchParams.get("limit"));
  const data = await getMlbPlayerRatingBacktest({
    source: url.searchParams.get("source"),
    season: Number.isInteger(seasonRaw) && seasonRaw > 1800 ? seasonRaw : null,
    limit: Number.isInteger(limitRaw) && limitRaw > 0 ? limitRaw : 80
  });
  return NextResponse.json(data);
}
