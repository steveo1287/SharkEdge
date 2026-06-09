import { NextResponse } from "next/server";

import { syncMlbPlayerDataSources } from "@/services/players/mlb-player-data-source-sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await syncMlbPlayerDataSources({ calibrate: false });
  return NextResponse.json(data, { status: data.ok ? 200 : 207 });
}

export async function POST(request: Request) {
  let body: { calibrate?: boolean; season?: number | null; source?: string | null } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const data = await syncMlbPlayerDataSources({
    calibrate: body.calibrate === true,
    season: body.season ?? null,
    source: body.source ?? null
  });
  return NextResponse.json(data, { status: data.ok ? 200 : 207 });
}
