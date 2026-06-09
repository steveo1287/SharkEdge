import { NextResponse } from "next/server";

import { ingestMlbPlayerDataPipe, type MlbPlayerDataPipePayload } from "@/services/players/mlb-player-data-pipe";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  let payload: MlbPlayerDataPipePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const result = await ingestMlbPlayerDataPipe(payload);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
