import { NextResponse } from "next/server";

import { getMlbPlayerDataHealth } from "@/services/players/mlb-player-data-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const health = await getMlbPlayerDataHealth();
  return NextResponse.json(health, { status: health.databaseReady ? 200 : 503 });
}
