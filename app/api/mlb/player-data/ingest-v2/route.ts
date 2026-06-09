import { NextResponse } from "next/server";

import { ingestMlbPlayerDataV2 } from "@/services/players/mlb-player-data-ingest-v2";
import type { MlbPlayerDataPipePayload } from "@/services/players/mlb-player-data-pipe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  let payload: MlbPlayerDataPipePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await ingestMlbPlayerDataV2(payload);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
