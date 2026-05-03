import { NextResponse } from "next/server";

import { getUfcFightIqDetail } from "@/services/ufc/card-feed";

export async function GET(request: Request, context: { params: Promise<{ fightId: string }> }) {
  const { fightId } = await context.params;
  const url = new URL(request.url);
  const modelVersion = url.searchParams.get("modelVersion") ?? undefined;
  try {
    const fight = await getUfcFightIqDetail(fightId, { modelVersion });
    if (!fight) return NextResponse.json({ ok: false, error: "UFC fight not found" }, { status: 404 });
    return NextResponse.json({ ok: true, fight });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "UFC fight detail failed" }, { status: 500 });
  }
}
