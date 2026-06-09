import { NextResponse } from "next/server";

import { getMlbPlayerCardDataGaps } from "@/services/players/mlb-player-card-data-gaps";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const gaps = await getMlbPlayerCardDataGaps();
  return NextResponse.json(gaps);
}
