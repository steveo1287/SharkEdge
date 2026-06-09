import { NextResponse } from "next/server";

import { validateMlbPlayerDataPayload } from "@/services/players/mlb-player-data-quality";
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

  const result = validateMlbPlayerDataPayload(payload);
  const { cleanPayload: _cleanPayload, ...publicResult } = result;
  return NextResponse.json(publicResult, { status: result.ok ? 200 : 422 });
}
